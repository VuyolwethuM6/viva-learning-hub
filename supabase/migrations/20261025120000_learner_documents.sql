create sequence if not exists public.learner_number_seq;

create or replace function public.generate_student_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'VT-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.learner_number_seq')::text, 6, '0');
$$;

revoke all on function public.generate_student_number() from public, anon, authenticated;
grant execute on function public.generate_student_number() to service_role;
revoke all on sequence public.learner_number_seq from public, anon, authenticated;

alter table public.learners
  add column if not exists student_number text;

update public.learners
set student_number = public.generate_student_number()
where student_number is null;

alter table public.learners
  alter column student_number set not null;

create unique index if not exists idx_learners_student_number
  on public.learners(student_number);

alter table public.applications
  add column if not exists report_card_path text;

create table if not exists public.learner_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

alter table public.learner_documents enable row level security;
revoke all on public.learner_documents from anon, authenticated;
grant all on public.learner_documents to service_role;

create or replace function public.submit_enrollment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_application_number text := p_payload ->> 'application_number';
  v_student_number text;
  v_storage_path text;
  v_extension text := p_payload ->> 'report_card_extension';
  v_subject jsonb;
begin
  if v_extension not in ('pdf', 'jpg', 'jpeg', 'png') then
    raise exception 'Unsupported report card extension';
  end if;

  insert into public.applications (
    application_number, learner_name, learner_email, guardian_name,
    guardian_email, grade_level, tutoring_mode, selected_subjects,
    selected_goals, monthly_fee, payment_status, status,
    report_card_name, report_card_size, report_card_path,
    terms_accepted, photo_consent, source
  )
  values (
    v_application_number,
    p_payload #>> '{student,name}',
    p_payload #>> '{student,email}',
    p_payload #>> '{guardian,name}',
    p_payload #>> '{guardian,email}',
    p_payload ->> 'grade',
    p_payload ->> 'mode',
    coalesce(array(select jsonb_array_elements_text(p_payload -> 'selected_subjects')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_payload -> 'goals')), '{}'),
    (p_payload ->> 'monthly_fee')::numeric,
    'not_started',
    'draft',
    nullif(p_payload ->> 'report_card_name', ''),
    (p_payload ->> 'report_card_size')::integer,
    null,
    true,
    coalesce((p_payload ->> 'photo_consent')::boolean, false),
    'website_enrollment'
  )
  returning id into v_application_id;

  insert into public.learners (
    application_id, student_number, full_name, dob, gender, email, phone, school
  )
  values (
    v_application_id,
    public.generate_student_number(),
    p_payload #>> '{student,name}',
    nullif(p_payload #>> '{student,dob}', '')::date,
    nullif(p_payload #>> '{student,gender}', ''),
    p_payload #>> '{student,email}',
    nullif(p_payload #>> '{student,phone}', ''),
    nullif(p_payload #>> '{student,school}', '')
  )
  returning student_number into v_student_number;

  v_storage_path := v_student_number || '/' || v_application_number || '/report-card.' || v_extension;

  update public.applications
  set report_card_path = v_storage_path
  where id = v_application_id;

  insert into public.guardians (
    application_id, full_name, email, phone, relationship
  )
  values (
    v_application_id,
    p_payload #>> '{guardian,name}',
    p_payload #>> '{guardian,email}',
    nullif(p_payload #>> '{guardian,phone}', ''),
    'guardian'
  );

  for v_subject in
    select value from jsonb_array_elements(coalesce(p_payload -> 'subjects', '[]'::jsonb))
  loop
    insert into public.application_subjects (
      application_id, subject_name, current_mark, target_mark, difficulties
    )
    values (
      v_application_id,
      v_subject ->> 'name',
      nullif(v_subject ->> 'current_mark', '')::numeric,
      nullif(v_subject ->> 'target_mark', '')::numeric,
      coalesce(array(select jsonb_array_elements_text(v_subject -> 'difficulties')), '{}')
    );
  end loop;

  return jsonb_build_object(
    'id', v_application_id,
    'application_number', v_application_number,
    'student_number', v_student_number,
    'storage_path', v_storage_path
  );
end;
$$;

revoke all on function public.submit_enrollment(jsonb) from public, anon, authenticated;
grant execute on function public.submit_enrollment(jsonb) to service_role;

create or replace function public.finalize_enrollment_document(p_application_id uuid, p_mime_type text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.applications%rowtype;
  v_student_number text;
begin
  select a.*
  into v_application
  from public.applications a
  where a.id = p_application_id
  for update of a;

  if not found then
    raise exception 'Enrollment was not found';
  end if;
  select l.student_number
  into v_student_number
  from public.learners l
  where l.application_id = v_application.id;

  if not found then
    raise exception 'Learner record was not found for enrollment';
  end if;
  if v_application.report_card_path is null or v_application.report_card_size is null then
    raise exception 'Enrollment document details are missing';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Unsupported report card MIME type';
  end if;

  if v_application.status = 'pending_review' then
    return jsonb_build_object(
      'application_id', v_application.id,
      'application_number', v_application.application_number,
      'student_number', v_student_number,
      'status', v_application.status
    );
  end if;
  if v_application.status <> 'draft' then
    raise exception 'Enrollment is not awaiting document upload';
  end if;

  insert into public.learner_documents (
    application_id, document_type, file_name, storage_path, mime_type, size_bytes
  )
  values (
    v_application.id,
    'report_card',
    v_application.report_card_name,
    v_application.report_card_path,
    p_mime_type,
    v_application.report_card_size
  );

  update public.applications
  set status = 'pending_review'
  where id = v_application.id;

  return jsonb_build_object(
    'application_id', v_application.id,
    'application_number', v_application.application_number,
    'student_number', v_student_number,
    'status', 'pending_review'
  );
end;
$$;

revoke all on function public.finalize_enrollment_document(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_enrollment_document(uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learner-documents', 'learner-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
