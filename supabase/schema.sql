create extension if not exists "pgcrypto";

do $$
begin
  create type public.application_status as enum (
    'draft',
    'pending_review',
    'pending_payment',
    'approved',
    'rejected',
    'active',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.portal_role as enum ('learner', 'guardian', 'tutor', 'admin');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  application_number text not null unique,
  learner_name text not null,
  learner_email text not null,
  guardian_name text not null,
  guardian_email text not null,
  grade_level text not null,
  tutoring_mode text not null,
  selected_subjects text[] not null default '{}',
  selected_goals text[] not null default '{}',
  monthly_fee numeric(10,2) not null default 0,
  payment_status text not null default 'not_started',
  status public.application_status not null default 'pending_review',
  report_card_name text,
  report_card_size integer,
  terms_accepted boolean not null default false,
  photo_consent boolean not null default false,
  source text not null default 'website_enrollment',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.applications
  alter column payment_status set default 'not_started',
  add column if not exists report_card_path text;

create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  student_number text unique,
  full_name text not null,
  dob date,
  gender text,
  email text not null,
  phone text,
  school text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

update public.learners
set student_number = public.generate_student_number()
where student_number is null;

alter table public.learners
  alter column student_number set not null;

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

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_subjects (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  subject_name text not null,
  current_mark numeric(5,2),
  target_mark numeric(5,2),
  difficulties text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (application_id, subject_name)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  payment_method text not null,
  provider text not null,
  provider_reference text,
  amount numeric(10,2) not null,
  currency text not null default 'ZAR',
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_users (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  email text not null,
  role public.portal_role not null,
  is_active boolean not null default false,
  supabase_user_id uuid,
  created_at timestamptz not null default now(),
  unique (application_id, email, role)
);

create table if not exists public.tutor_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  tutor_id uuid,
  assigned_at timestamptz not null default now(),
  status text not null default 'assigned'
);

create index if not exists idx_applications_status on public.applications(status);
create index if not exists idx_applications_email on public.applications(learner_email);
create index if not exists idx_payments_status on public.payments(status);
create index if not exists idx_portal_users_email on public.portal_users(email);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists applications_updated_at on public.applications;
create trigger applications_updated_at
before update on public.applications
for each row execute procedure public.set_updated_at();

drop trigger if exists learners_updated_at on public.learners;
create trigger learners_updated_at
before update on public.learners
for each row execute procedure public.set_updated_at();

drop trigger if exists guardians_updated_at on public.guardians;
create trigger guardians_updated_at
before update on public.guardians
for each row execute procedure public.set_updated_at();

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
before update on public.payments
for each row execute procedure public.set_updated_at();

alter table public.applications enable row level security;
alter table public.learners enable row level security;
alter table public.learner_documents enable row level security;
alter table public.guardians enable row level security;
alter table public.application_subjects enable row level security;
alter table public.payments enable row level security;
alter table public.portal_users enable row level security;
alter table public.tutor_assignments enable row level security;

drop policy if exists "Applications are viewable by admin and owner" on public.applications;
drop policy if exists "Applications are writable by admin only" on public.applications;
drop policy if exists "Learners are viewable by admin and owner" on public.learners;
drop policy if exists "Guardians are viewable by admin and owner" on public.guardians;
drop policy if exists "Application subjects are viewable by admin" on public.application_subjects;
drop policy if exists "Payment records are viewable by admin" on public.payments;
drop policy if exists "Portal users are viewable by admin" on public.portal_users;
drop policy if exists "Tutor assignments are viewable by admin" on public.tutor_assignments;
drop policy if exists "Storage bucket for learner documents exists" on storage.objects;

revoke all on public.applications, public.learners, public.guardians,
  public.application_subjects, public.payments, public.portal_users,
  public.tutor_assignments, public.learner_documents from anon, authenticated;
grant all on public.applications, public.learners, public.guardians,
  public.application_subjects, public.payments, public.portal_users,
  public.tutor_assignments, public.learner_documents to service_role;

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
    nullif(p_payload ->> 'report_card_size', '')::integer,
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
