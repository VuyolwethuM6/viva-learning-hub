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


-- 20261026090000_enrollment_email_claims.sql
-- Captures the owner's previously dashboard-applied email prerequisites.
alter table public.applications add column if not exists receipt_emailed_at timestamptz;
alter table public.applications add column if not exists admin_notified_at timestamptz;
alter table public.applications add column if not exists email_last_error text;
create or replace function public.claim_enrollment_email(p_application_id uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  if p_kind = 'receipt' then
    update public.applications set receipt_emailed_at=now(), email_last_error=null
      where id=p_application_id and status='pending_review' and receipt_emailed_at is null;
  elsif p_kind = 'admin' then
    update public.applications set admin_notified_at=now(), email_last_error=null
      where id=p_application_id and status='pending_review' and admin_notified_at is null;
  else raise exception 'Invalid email kind'; end if;
  get diagnostics v_rows = row_count;
  return v_rows=1;
end $$;
create or replace function public.release_enrollment_email(p_application_id uuid, p_kind text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind = 'receipt' then
    update public.applications set receipt_emailed_at=null, email_last_error=left(coalesce(p_error,''),300) where id=p_application_id;
  elsif p_kind = 'admin' then
    update public.applications set admin_notified_at=null, email_last_error=left(coalesce(p_error,''),300) where id=p_application_id;
  else raise exception 'Invalid email kind'; end if;
end $$;
revoke all on function public.claim_enrollment_email(uuid,text), public.release_enrollment_email(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_enrollment_email(uuid,text), public.release_enrollment_email(uuid,text,text) to service_role;


-- 20261026100000_admin_tuition.sql
-- Run after the intake/document schema. All operations use the server service role.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id), enabled boolean not null default true
);
alter table public.applications
  add column if not exists tuition_start_date date,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists activated_at timestamptz;
create table if not exists public.tuition_closures (
  day date primary key, reason text not null check(length(trim(reason))>0)
);
create table if not exists public.tuition_programmes (
  grade text primary key, label text not null,
  weekdays smallint[] not null check(cardinality(weekdays)>0 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);
-- Mirrors src/lib/tuition-programme.json; tests detect drift. Preserve deployed overrides on rerun.
insert into public.tuition_programmes(grade,label,weekdays) values
('Grade 8','Grades 8–9 afternoon programme',array[1,2,3,4,5,6]::smallint[]),
('Grade 9','Grades 8–9 afternoon programme',array[1,2,3,4,5,6]::smallint[]),
('Grade 10','Grades 10–11 afternoon programme',array[1,2,3,4,5,6]::smallint[]),
('Grade 11','Grades 10–11 afternoon programme',array[1,2,3,4,5,6]::smallint[]),
('Grade 12','Grade 12 programme including Sunday feedback',array[1,2,3,4,5,6,7]::smallint[]),
('Matric Rewrite','Matric Rewrite weekday programme',array[1,2,3,4,5]::smallint[])
on conflict(grade) do nothing;
create sequence if not exists public.tuition_invoice_seq;
create table if not exists public.tuition_invoices (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id),
  number text not null unique default ('VT-T-' || lpad(nextval('public.tuition_invoice_seq')::text,8,'0')),
  billing_month date not null check(extract(day from billing_month)=1),
  period_start date not null, period_end date not null,
  due_date date not null, monthly_fee numeric(10,2) not null check(monthly_fee>0),
  teaching_days integer not null check(teaching_days>0),
  remaining_days integer not null check(remaining_days>0 and remaining_days<=teaching_days),
  programme_label text not null, programme_weekdays smallint[] not null,
  amount_cents integer not null check(amount_cents>0),
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  unique(application_id,billing_month), check(period_start<=period_end)
);
create table if not exists public.tuition_payments (
  id uuid primary key, invoice_id uuid not null references public.tuition_invoices(id),
  amount_cents integer not null check(amount_cents>0), paid_on date not null,
  method text not null check(method in ('EFT','Cash','Card','SnapScan')),
  transaction_reference text not null check(length(trim(transaction_reference)) between 3 and 120),
  note text not null default '', verified_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), unique(method,transaction_reference)
);
create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
  action text not null, application_id uuid references public.applications(id),
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.tuition_messages (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.tuition_invoices(id),
  kind text not null check(kind in ('invoice','receipt','reminder','activation')),
  event_key text not null unique, payload jsonb not null,
  state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
  attempts integer not null default 0, first_attempt_at timestamptz, claimed_at timestamptz, claim_token uuid,
  sent_at timestamptz, last_error text, created_at timestamptz not null default now()
);
create index if not exists tuition_invoice_app on public.tuition_invoices(application_id);
create index if not exists tuition_payment_invoice on public.tuition_payments(invoice_id);
create index if not exists admin_audit_created on public.admin_audit(created_at desc);

alter table public.tuition_programmes enable row level security;
alter table public.admin_users enable row level security;
alter table public.tuition_closures enable row level security;
alter table public.tuition_invoices enable row level security;
alter table public.tuition_payments enable row level security;
alter table public.admin_audit enable row level security;
alter table public.tuition_messages enable row level security;
revoke all on public.tuition_programmes,public.admin_users,public.tuition_closures,public.tuition_invoices,public.tuition_payments,public.admin_audit,public.tuition_messages from public,anon,authenticated;
grant all on public.tuition_programmes,public.admin_users,public.tuition_closures,public.tuition_invoices,public.tuition_payments,public.admin_audit,public.tuition_messages to service_role;
revoke all on sequence public.tuition_invoice_seq from public,anon,authenticated;
grant all on sequence public.tuition_invoice_seq to service_role;

create or replace function public.tuition_today() returns date language sql stable set search_path='' as $$
  select (now() at time zone 'Africa/Johannesburg')::date;
$$;

create or replace function public.admin_assert(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.admin_users where user_id=p_actor and enabled) then raise exception 'Admin access is required.'; end if;
end $$;

create or replace function public.admin_queue(p_invoice uuid,p_kind text,p_key text,p_extra jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.tuition_messages(invoice_id,kind,event_key,payload)
  select i.id,p_kind,p_key,jsonb_build_object(
    'invoiceNumber',i.number,'studentNumber',l.student_number,'learner',a.learner_name,
    'recipients',jsonb_build_array(a.guardian_email,a.learner_email),'month',i.billing_month,
    'dueDate',i.due_date,'amountCents',i.amount_cents,'monthlyFee',i.monthly_fee,
    'remainingDays',i.remaining_days,'teachingDays',i.teaching_days,
    'balanceCents',i.amount_cents-coalesce((select sum(amount_cents) from public.tuition_payments where invoice_id=i.id),0)
  ) || p_extra
  from public.tuition_invoices i join public.applications a on a.id=i.application_id
  join public.learners l on l.application_id=a.id where i.id=p_invoice
  on conflict(event_key) do nothing;
end $$;

create or replace function public.admin_create_invoice(p_actor uuid,p_application uuid,p_month date,p_start date) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.applications; programme public.tuition_programmes; v_end date; v_total integer; v_remaining integer; v_id uuid;
begin
  perform public.admin_assert(p_actor);
  select * into a from public.applications where id=p_application for update;
  if a.id is null or a.monthly_fee<=0 then raise exception 'A valid application fee is required.'; end if;
  if p_month is null or p_start is null or extract(day from p_month)<>1 or date_trunc('month',p_start)::date<>p_month then raise exception 'The start date must be in the billing month.'; end if;
  select * into programme from public.tuition_programmes where grade=a.grade_level;
  if programme.grade is null then raise exception 'A billing programme must be configured for this grade.'; end if;
  v_end=(p_month+interval '1 month - 1 day')::date;
  select count(*),count(*) filter(where d::date>=p_start) into v_total,v_remaining
    from generate_series(p_month::timestamp,v_end::timestamp,interval '1 day') d
    where extract(isodow from d)::integer=any(programme.weekdays) and not exists(select 1 from public.tuition_closures c where c.day=d::date);
  if v_remaining=0 then raise exception 'No teaching days remain in this period.'; end if;
  insert into public.tuition_invoices(application_id,billing_month,period_start,period_end,due_date,monthly_fee,teaching_days,remaining_days,programme_label,programme_weekdays,amount_cents,created_by)
  values(a.id,p_month,p_start,v_end,p_start,a.monthly_fee,v_total,v_remaining,programme.label,programme.weekdays,round(a.monthly_fee*100*v_remaining/v_total),p_actor)
  on conflict(application_id,billing_month) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.tuition_invoices where application_id=a.id and billing_month=p_month; end if;
  perform public.admin_queue(v_id,'invoice','invoice:'||v_id);
  return v_id;
end $$;

create or replace function public.admin_mutate(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a public.applications; i public.tuition_invoices; pay public.tuition_payments;
  v_app uuid; v_invoice uuid; v_id uuid; v_start date; v_month date;
  v_today date=public.tuition_today();
  v_paid bigint; v_amount integer; v_note text=trim(coalesce(p_data->>'note',''));
  v_method text; v_ref text; v_count integer=0; v_existing public.tuition_payments; v_days smallint[];
begin
  perform public.admin_assert(p_actor);
  if length(v_note)>2000 then raise exception 'Notes must be at most 2000 characters.'; end if;
  if p_action='generate_month' then
    v_month=(p_data->>'month')::date;
    if v_month is null or extract(day from v_month)<>1 or v_month<>date_trunc('month',v_today+interval '1 month')::date or extract(day from v_today)<25 then
      raise exception 'Generate next month invoices on or after the 25th.';
    end if;
    for a in select * from public.applications where status='active' and tuition_start_date<=v_month order by id for update loop
      if not exists(select 1 from public.tuition_invoices where application_id=a.id and billing_month=v_month) then
        perform public.admin_create_invoice(p_actor,a.id,v_month,v_month); v_count=v_count+1;
      end if;
    end loop;
  elsif p_action='queue_reminders' then
    if extract(day from v_today)<3 then raise exception 'Unpaid-balance reminders start on the 3rd.'; end if;
    for i in select * from public.tuition_invoices where due_date<=v_today order by id for update loop
      select coalesce(sum(amount_cents),0) into v_paid from public.tuition_payments where invoice_id=i.id;
      if v_paid<i.amount_cents then
        perform public.admin_queue(i.id,'reminder','reminder:'||i.id||':'||date_trunc('month',v_today)::date); v_count=v_count+1;
      end if;
    end loop;
  elsif p_action='payment' then
    v_invoice=(p_data->>'invoiceId')::uuid;
    select * into i from public.tuition_invoices where id=v_invoice for update;
    if i.id is null then raise exception 'Invoice not found.'; end if;
    v_app=i.application_id;
    v_id=(p_data->>'paymentId')::uuid;
    v_amount=(p_data->>'amountCents')::integer;
    v_method=p_data->>'method'; v_ref=upper(trim(p_data->>'reference'));
    v_start=(p_data->>'paidOn')::date;
    if length(v_note)<5 then raise exception 'Record how you verified this payment (at least five characters).'; end if;
    if v_id is null or v_amount is null or v_amount<=0 or v_start is null or v_start>v_today or v_start<'2020-01-01' or v_method is null or v_method not in ('EFT','Cash','Card','SnapScan') or v_ref is null or length(v_ref)<3 or length(v_ref)>120 then raise exception 'Supply a valid amount, payment date, method and unique transaction reference.'; end if;
    select * into v_existing from public.tuition_payments where id=v_id;
    if v_existing.id is not null then
      if v_existing.invoice_id<>i.id or v_existing.amount_cents<>v_amount or v_existing.method<>v_method or v_existing.transaction_reference<>v_ref or v_existing.paid_on<>v_start then raise exception 'This payment request was already used with different details.'; end if;
      return jsonb_build_object('paymentId',v_id,'alreadyRecorded',true);
    end if;
    if exists(select 1 from public.tuition_payments where method=v_method and transaction_reference=v_ref) then raise exception 'This transaction reference has already been recorded for this method.'; end if;
    select coalesce(sum(amount_cents),0) into v_paid from public.tuition_payments where invoice_id=i.id;
    if v_amount>i.amount_cents-v_paid then raise exception 'The payment exceeds the outstanding balance. Record only the allocation for this invoice.'; end if;
    insert into public.tuition_payments(id,invoice_id,amount_cents,paid_on,method,transaction_reference,note,verified_by)
      values(v_id,i.id,v_amount,v_start,v_method,v_ref,v_note,p_actor);
    perform public.admin_queue(i.id,'receipt','receipt:'||v_id,jsonb_build_object('paymentId',v_id,'paidCents',v_amount,'paidOn',v_start,'method',v_method));
  else
    v_app=(p_data->>'applicationId')::uuid;
    select * into a from public.applications where id=v_app for update;
    if a.id is null then raise exception 'Application not found.'; end if;
    if p_action='approve' then
      if a.status<>'pending_review' then raise exception 'Only applications pending review can be approved.'; end if;
      v_start=(p_data->>'startDate')::date;
      if v_start is null or v_start<v_today then raise exception 'Choose today or a future start date.'; end if;
      select weekdays into v_days from public.tuition_programmes where grade=a.grade_level;
      if v_days is null then raise exception 'A billing programme must be configured for this grade.'; end if;
      if not (extract(isodow from v_start)::integer=any(v_days)) or exists(select 1 from public.tuition_closures where day=v_start) then raise exception 'Choose a scheduled programme day that is not a closure.'; end if;
      if not exists(select 1 from public.learner_documents where application_id=a.id) then raise exception 'A finalized report card is required before approval.'; end if;
      update public.applications set status='pending_payment',tuition_start_date=v_start,reviewed_at=now(),reviewed_by=p_actor where id=a.id;
      v_invoice=public.admin_create_invoice(p_actor,a.id,date_trunc('month',v_start)::date,v_start);
    elsif p_action='reject' then
      if a.status<>'pending_review' or length(v_note)<5 then raise exception 'Reject only a pending review application and give a reason of at least five characters.'; end if;
      update public.applications set status='rejected',reviewed_at=now(),reviewed_by=p_actor where id=a.id;
    elsif p_action='note' then
      if length(v_note)=0 then raise exception 'A note is required.'; end if;
    elsif p_action='activate' then
      if a.status<>'pending_payment' or a.reviewed_by is null then raise exception 'Approval and first payment are required before activation.'; end if;
      select * into i from public.tuition_invoices where application_id=a.id order by billing_month limit 1 for update;
      select coalesce(sum(amount_cents),0) into v_paid from public.tuition_payments where invoice_id=i.id;
      if i.id is null or v_paid<i.amount_cents then raise exception 'The first invoice must be fully paid before activation.'; end if;
      update public.applications set status='active',activated_at=now(),payment_status='first_invoice_paid' where id=a.id;
      perform public.admin_queue(i.id,'activation','activation:'||a.id);
    else raise exception 'Unknown action.'; end if;
  end if;
  insert into public.admin_audit(actor_id,action,application_id,details)
    values(p_actor,p_action,v_app,p_data-'action');
  return jsonb_build_object('invoiceId',v_invoice,'count',v_count);
end $$;

create or replace function public.admin_snapshot(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.admin_assert(p_actor);
  return jsonb_build_object(
    'applications',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select a.*,l.student_number,to_jsonb(l) as learner,
        (select to_jsonb(g) from public.guardians g where g.application_id=a.id limit 1) as guardian,
        coalesce((select jsonb_agg(s) from public.application_subjects s where s.application_id=a.id),'[]') as subject_marks
        from public.applications a left join public.learners l on l.application_id=a.id order by a.created_at desc limit 500) x),'[]'),
    'invoices',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select i.*,coalesce((select sum(amount_cents) from public.tuition_payments where invoice_id=i.id),0) paid_cents
      from public.tuition_invoices i order by i.created_at desc limit 1000) x),'[]'),
    'payments',coalesce((select jsonb_agg(x) from (select * from public.tuition_payments order by created_at desc limit 1000)x),'[]'),
    'audit',coalesce((select jsonb_agg(x) from(select * from public.admin_audit order by created_at desc limit 200)x),'[]'),
    'messages',coalesce((select jsonb_agg(x) from(select id,invoice_id,kind,state,attempts,last_error,created_at,sent_at from public.tuition_messages order by created_at desc limit 200)x),'[]'),
    'programmes',coalesce((select jsonb_agg(p order by grade) from public.tuition_programmes p),'[]'),
    'closures',coalesce((select jsonb_agg(c order by day) from public.tuition_closures c),'[]'),
    'truncated', (select count(*)>=500 from public.applications) or (select count(*)>=1000 from public.tuition_invoices) or (select count(*)>=1000 from public.tuition_payments),
    'today',public.tuition_today()
  );
end $$;
create or replace function public.admin_log_document(p_actor uuid,p_application uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.admin_assert(p_actor);
  insert into public.admin_audit(actor_id,action,application_id) values(p_actor,'view_document',p_application);
end $$;

-- A lease prevents concurrent admin sends. Resend's stable idempotency key covers short retries.
create or replace function public.admin_claim_message(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.tuition_messages; v_balance bigint;
begin
  perform public.admin_assert(p_actor);
  select * into m from public.tuition_messages where id=p_id for update;
  if m.id is null or m.state='sent' then return null; end if;
  if m.state='sending' and m.claimed_at>now()-interval '2 minutes' then raise exception 'This message is already being sent.'; end if;
  -- Provider idempotency keys are not permanent. Require investigation of ambiguous old sends.
  if m.first_attempt_at is not null and m.first_attempt_at<now()-interval '23 hours' then raise exception 'Old delivery attempt requires provider-history review before retry.'; end if;
  select i.amount_cents-coalesce((select sum(amount_cents) from public.tuition_payments where invoice_id=i.id),0) into v_balance from public.tuition_invoices i where i.id=m.invoice_id;
  if m.kind='reminder' and v_balance<=0 then
    update public.tuition_messages set state='sent',sent_at=now(),last_error='Skipped: invoice settled' where id=m.id;
    return null;
  end if;
  update public.tuition_messages set state='sending',first_attempt_at=coalesce(first_attempt_at,now()),claimed_at=now(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=m.id returning * into m;
  insert into public.admin_audit(actor_id,action,details) values(p_actor,'send_message',jsonb_build_object('messageId',m.id));
  return to_jsonb(m);
end $$;
create or replace function public.admin_finish_message(p_actor uuid,p_id uuid,p_claim uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.admin_assert(p_actor);
  update public.tuition_messages set state=case when p_success then 'sent' else 'failed' end,
    sent_at=case when p_success then now() else null end,last_error=case when p_success then null else 'Delivery not confirmed. Check provider history before retrying.' end
    where id=p_id and state='sending' and claim_token=p_claim;
end $$;

revoke all on function public.tuition_today(),public.admin_assert(uuid),public.admin_queue(uuid,text,text,jsonb),public.admin_create_invoice(uuid,uuid,date,date),public.admin_mutate(uuid,text,jsonb),public.admin_snapshot(uuid),public.admin_log_document(uuid,uuid),public.admin_claim_message(uuid,uuid),public.admin_finish_message(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_mutate(uuid,text,jsonb),public.admin_snapshot(uuid),public.admin_log_document(uuid,uuid),public.admin_claim_message(uuid,uuid),public.admin_finish_message(uuid,uuid,uuid,boolean) to service_role;


-- 20261026110000_verified_document_finalization.sql
-- Repair finalization drift without deleting files, resetting status, or resending email.
create table if not exists public.learner_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check(size_bytes>0 and size_bytes<=10485760),
  created_at timestamptz not null default now()
);
alter table public.learner_documents enable row level security;
revoke all on public.learner_documents from public,anon,authenticated;
grant all on public.learner_documents to service_role;

create or replace function public.finalize_enrollment_document(p_application_id uuid,p_mime_type text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_app public.applications%rowtype;
  v_doc public.learner_documents%rowtype;
  v_metadata jsonb;
  v_size_text text;
  v_size bigint;
  v_mime text;
  v_expected_mime text;
  v_student_number text;
begin
  select * into v_app from public.applications where id=p_application_id for update;
  if not found then raise exception 'Enrollment was not found'; end if;
  if v_app.status not in ('draft','pending_review') then
    raise exception 'This enrollment is not awaiting document completion';
  end if;
  select student_number into v_student_number from public.learners where application_id=v_app.id;
  if v_student_number is null then raise exception 'Learner number was not found'; end if;
  if v_app.report_card_path is null or v_app.report_card_name is null or v_app.report_card_size is null then
    raise exception 'Enrollment document details are missing';
  end if;
  if not exists(select 1 from storage.buckets where id='learner-documents' and not public) then
    raise exception 'The learner document bucket must be private';
  end if;
  select metadata into v_metadata from storage.objects
    where bucket_id='learner-documents' and name=v_app.report_card_path;
  if not found then raise exception 'The uploaded report card was not found'; end if;
  v_size_text=coalesce(v_metadata->>'size',v_metadata->>'contentLength',v_metadata->>'content_length');
  if v_size_text is null or v_size_text !~ '^[0-9]+$' then
    raise exception 'Storage file size could not be verified';
  end if;
  v_size=v_size_text::bigint;
  v_mime=lower(trim(split_part(coalesce(
    v_metadata->>'mimetype',v_metadata->>'contentType',
    v_metadata->>'content_type',v_metadata->>'content-type',''
  ),';',1)));
  v_expected_mime=case substring(lower(v_app.report_card_path) from '[.]([a-z0-9]+)$')
    when 'pdf' then 'application/pdf'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    when 'png' then 'image/png'
    else null end;
  if v_expected_mime is null or v_mime is distinct from v_expected_mime
     or lower(trim(p_mime_type)) is distinct from v_mime then
    raise exception 'The uploaded report card type does not match the application';
  end if;
  if v_size<=0 or v_size>10485760 or v_size<>v_app.report_card_size then
    raise exception 'The uploaded report card size does not match the application';
  end if;
  select * into v_doc from public.learner_documents where application_id=v_app.id;
  if found then
    if v_doc.document_type is distinct from 'report_card'
       or v_doc.file_name is distinct from v_app.report_card_name
       or v_doc.storage_path is distinct from v_app.report_card_path
       or v_doc.mime_type is distinct from v_mime
       or v_doc.size_bytes is distinct from v_size then
      raise exception 'Existing report card metadata differs; manual review is required';
    end if;
  else
    insert into public.learner_documents(application_id,document_type,file_name,storage_path,mime_type,size_bytes)
    values(v_app.id,'report_card',v_app.report_card_name,v_app.report_card_path,v_mime,v_size::integer)
    returning * into v_doc;
  end if;
  if v_app.status='draft' then
    update public.applications set status='pending_review' where id=v_app.id;
  end if;
  return jsonb_build_object(
    'application_id',v_app.id,
    'application_number',v_app.application_number,
    'student_number',v_student_number,
    'status','pending_review',
    'document_id',v_doc.id
  );
end $$;
revoke all on function public.finalize_enrollment_document(uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_enrollment_document(uuid,text) to service_role;


-- 20261026120000_monthly_invoice_numbers.sql
-- Existing issued invoice numbers remain unchanged. New numbers use the tuition month.
create table if not exists public.tuition_invoice_counters (
  billing_month date primary key check(extract(day from billing_month)=1),
  last_number bigint not null check(last_number>0)
);
alter table public.tuition_invoice_counters enable row level security;
revoke all on public.tuition_invoice_counters from public,anon,authenticated;
grant all on public.tuition_invoice_counters to service_role;
-- Preserve and advance any existing counter. Do not reset sequences on a rerun.
insert into public.tuition_invoice_counters(billing_month,last_number)
select billing_month,max(substring(number from 10)::bigint)
from public.tuition_invoices
where number ~ ('^VT-' || to_char(billing_month,'YYYYMM') || '[0-9]{2,}$')
group by billing_month
on conflict(billing_month) do update set last_number=greatest(public.tuition_invoice_counters.last_number,excluded.last_number);

create or replace function public.assign_tuition_invoice_number()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_number bigint;
begin
  insert into public.tuition_invoice_counters(billing_month,last_number)
  values(new.billing_month,1)
  on conflict(billing_month) do update set last_number=public.tuition_invoice_counters.last_number+1
  returning last_number into v_number;
  new.number='VT-' || to_char(new.billing_month,'YYYYMM') ||
    case when v_number<10 then '0' else '' end || v_number::text;
  return new;
end $$;
revoke all on function public.assign_tuition_invoice_number() from public,anon,authenticated;
alter table public.tuition_invoices alter column number drop default;
drop trigger if exists assign_tuition_invoice_number on public.tuition_invoices;
create trigger assign_tuition_invoice_number before insert on public.tuition_invoices
for each row execute function public.assign_tuition_invoice_number();

-- Keep notification history while allowing an administrator to stop future sends.
-- Apply after the admin/tuition migration. Safe to rerun; existing messages are preserved.
alter table public.tuition_messages
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text;
alter table public.tuition_messages drop constraint if exists tuition_messages_state_check;
alter table public.tuition_messages add constraint tuition_messages_state_check
  check(state in ('pending','sending','sent','failed','cancelled'));

create or replace function public.admin_cancel_message(
  p_actor uuid,p_id uuid,p_reason text,p_provider_reviewed boolean default false
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.tuition_messages; v_application uuid; v_reason text=trim(coalesce(p_reason,''));
begin
  perform public.admin_assert(p_actor);
  select * into m from public.tuition_messages where id=p_id for update;
  if m.id is null then raise exception 'Notification not found.'; end if;
  if m.state='cancelled' then return jsonb_build_object('id',m.id,'alreadyCancelled',true); end if;
  if m.state='sent' then raise exception 'A completed notification cannot be cancelled or recalled.'; end if;
  if m.state='sending' and (m.claimed_at is null or m.claimed_at>now()-interval '2 minutes') then
    raise exception 'This notification is being sent. Refresh after the current attempt finishes.';
  end if;
  if length(v_reason)<5 or length(v_reason)>500 then raise exception 'Give a cancellation reason of 5 to 500 characters.'; end if;
  if m.attempts>0 and p_provider_reviewed is distinct from true then
    raise exception 'Check the email provider history before cancelling a previously attempted notification. Cancellation cannot recall an email.';
  end if;
  update public.tuition_messages set state='cancelled',cancelled_at=now(),cancelled_by=p_actor,cancellation_reason=v_reason where id=m.id;
  select application_id into v_application from public.tuition_invoices where id=m.invoice_id;
  insert into public.admin_audit(actor_id,action,application_id,details)
    values(p_actor,'cancel_message',v_application,jsonb_build_object('messageId',m.id,'invoiceId',m.invoice_id,'kind',m.kind,'reason',v_reason,'previousState',m.state,'attempts',m.attempts,'providerHistoryReviewed',coalesce(p_provider_reviewed,false)));
  return jsonb_build_object('id',m.id,'cancelled',true);
end $$;
revoke all on function public.admin_cancel_message(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_cancel_message(uuid,uuid,text,boolean) to service_role;

create or replace function public.admin_claim_message(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.tuition_messages; v_balance bigint;
begin
  perform public.admin_assert(p_actor);
  select * into m from public.tuition_messages where id=p_id for update;
  if m.id is null or m.state in ('sent','cancelled') then return null; end if;
  if m.state='sending' and m.claimed_at>now()-interval '2 minutes' then raise exception 'This message is already being sent.'; end if;
  -- Provider idempotency keys are not permanent. Require investigation of ambiguous old sends.
  if m.first_attempt_at is not null and m.first_attempt_at<now()-interval '23 hours' then raise exception 'Old delivery attempt requires provider-history review before retry.'; end if;
  select i.amount_cents-coalesce((select sum(amount_cents) from public.tuition_payments where invoice_id=i.id),0) into v_balance from public.tuition_invoices i where i.id=m.invoice_id;
  if m.kind='reminder' and v_balance<=0 then
    update public.tuition_messages set state='sent',sent_at=now(),last_error='Skipped: invoice settled' where id=m.id;
    return null;
  end if;
  update public.tuition_messages set state='sending',first_attempt_at=coalesce(first_attempt_at,now()),claimed_at=now(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=m.id returning * into m;
  insert into public.admin_audit(actor_id,action,details) values(p_actor,'send_message',jsonb_build_object('messageId',m.id));
  return to_jsonb(m);
end $$;

create or replace function public.admin_snapshot(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.admin_assert(p_actor);
  return jsonb_build_object(
    'applications',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select a.*,l.student_number,to_jsonb(l) as learner,
        (select to_jsonb(g) from public.guardians g where g.application_id=a.id limit 1) as guardian,
        coalesce((select jsonb_agg(s) from public.application_subjects s where s.application_id=a.id),'[]') as subject_marks
        from public.applications a left join public.learners l on l.application_id=a.id order by a.created_at desc limit 500) x),'[]'),
    'invoices',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select i.*,coalesce((select sum(amount_cents) from public.tuition_payments where invoice_id=i.id),0) paid_cents
      from public.tuition_invoices i order by i.created_at desc limit 1000) x),'[]'),
    'payments',coalesce((select jsonb_agg(x) from (select * from public.tuition_payments order by created_at desc limit 1000)x),'[]'),
    'audit',coalesce((select jsonb_agg(x) from(select a.*,u.email as actor_email from public.admin_audit a left join auth.users u on u.id=a.actor_id order by a.created_at desc,a.id desc limit 200)x),'[]'),
    'messages',coalesce((select jsonb_agg(x) from(select id,invoice_id,kind,state,attempts,last_error,created_at,sent_at,first_attempt_at,claimed_at,payload,cancelled_at,cancelled_by,cancellation_reason from public.tuition_messages order by case when state in ('pending','sending','failed') then 0 else 1 end,created_at desc,id desc limit 200)x),'[]'),
    'messages_truncated',(select count(*)>200 from public.tuition_messages),
    'programmes',coalesce((select jsonb_agg(p order by grade) from public.tuition_programmes p),'[]'),
    'closures',coalesce((select jsonb_agg(c order by day) from public.tuition_closures c),'[]'),
    'truncated', (select count(*)>=500 from public.applications) or (select count(*)>=1000 from public.tuition_invoices) or (select count(*)>=1000 from public.tuition_payments),
    'today',public.tuition_today()
  );
end $$;

notify pgrst, 'reload schema';

-- BEGIN ACCOUNTING MIGRATIONS (canonical files: supabase/migrations/20261027*.sql)
-- First install starts from the owner's cleared test books. Never guess legacy postings.
do $$ begin
  if to_regclass('public.accounting_settings') is null and
     (exists(select 1 from public.tuition_invoices) or exists(select 1 from public.tuition_payments)) then
    raise exception 'Accounting first install requires empty test financial tables or a reviewed opening-data import.';
  end if;
end $$;

alter table public.admin_users add column if not exists finance_role text not null default 'owner'
  check(finance_role in ('owner','bookkeeper','viewer'));
create table if not exists public.accounting_settings (
  singleton boolean primary key default true check(singleton),
  books_start date not null default '2026-01-01',
  closed_through date,
  automation_enabled boolean not null default false,
  auto_send boolean not null default false,
  scheduler_actor uuid references auth.users(id),
  currency text not null default 'ZAR' check(currency='ZAR'),
  vat_enabled boolean not null default false check(not vat_enabled),
  recognised_through date,
  check(closed_through is null or closed_through>=books_start-1)
);
insert into public.accounting_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.accounting_accounts (
  code text primary key check(code ~ '^[0-9]{4}$'), name text not null,
  kind text not null check(kind in ('asset','liability','equity','income','expense')),
  control_account boolean not null default false,
  active boolean not null default true
);
insert into public.accounting_accounts(code,name,kind,control_account) values
('1000','Business bank','asset',false),('1010','Cash on hand','asset',false),
('1100','Tuition receivable','asset',true),('1200','Other assets','asset',false),
('2000','Deferred tuition','liability',true),('2100','Family credits and advances','liability',true),
('2200','Supplier payables','liability',true),('2300','Other liabilities','liability',false),
('3000','Owner funding and opening capital','equity',false),
('4000','Tuition income','income',true),('4100','Other income','income',false),
('5000','Tutor payments','expense',false),('5010','Rent','expense',false),
('5020','Internet and communication','expense',false),('5030','Printing and learning materials','expense',false),
('5040','Marketing','expense',false),('5050','Bank charges','expense',false),('5090','Other operating costs','expense',false)
on conflict(code) do nothing;
create table if not exists public.accounting_journals (
  id uuid primary key default gen_random_uuid(), event_key text not null unique,
  posted_on date not null, description text not null,
  source_kind text not null, source_id uuid,
  actor_id uuid not null references auth.users(id),
  reversal_of uuid unique references public.accounting_journals(id),
  created_at timestamptz not null default now()
);
create table if not exists public.accounting_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.accounting_journals(id),
  account_code text not null references public.accounting_accounts(code),
  amount_cents bigint not null check(amount_cents<>0 and abs(amount_cents)<=2000000000),
  application_id uuid references public.applications(id),
  invoice_id uuid references public.tuition_invoices(id)
);
create index if not exists accounting_lines_journal on public.accounting_lines(journal_id);
create index if not exists accounting_lines_account on public.accounting_lines(account_code,journal_id);
create index if not exists accounting_lines_invoice on public.accounting_lines(invoice_id);
create index if not exists accounting_journals_date on public.accounting_journals(posted_on);
create table if not exists public.accounting_counters (
  kind text not null, month date not null, last_number bigint not null,
  primary key(kind,month)
);
create table if not exists public.accounting_receipts (
  id uuid primary key, number text not null unique,
  application_id uuid not null references public.applications(id),
  billing_email text not null, payer_name text not null,
  amount_cents bigint not null check(amount_cents>0 and amount_cents<=2000000000),
  paid_on date not null, method text not null check(method in ('EFT','Cash')),
  reference text not null check(length(trim(reference)) between 3 and 120),
  note text not null, actor_id uuid not null references auth.users(id),
  journal_id uuid not null references public.accounting_journals(id),
  reversed_at timestamptz, reversal_journal_id uuid references public.accounting_journals(id),
  created_at timestamptz not null default now(), unique(method,reference)
);
alter table public.tuition_payments
  add column if not exists receipt_id uuid references public.accounting_receipts(id);
alter table public.tuition_payments drop constraint if exists tuition_payments_method_transaction_reference_key;
create table if not exists public.accounting_allocation_releases (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.tuition_payments(id),
  amount_cents bigint not null check(amount_cents>0),
  reason text not null, journal_id uuid not null references public.accounting_journals(id),
  created_at timestamptz not null default now()
);
create table if not exists public.accounting_credit_notes (
  id uuid primary key, number text not null unique,
  invoice_id uuid not null references public.tuition_invoices(id),
  amount_cents bigint not null check(amount_cents>0), reason text not null,
  issued_on date not null, actor_id uuid not null references auth.users(id),
  journal_id uuid not null references public.accounting_journals(id), created_at timestamptz not null default now()
);
create table if not exists public.accounting_allocation_snapshots (
  payment_id uuid primary key references public.tuition_payments(id),
  balance_cents bigint not null,
  created_at timestamptz not null default now()
);
alter table public.accounting_allocation_snapshots enable row level security;
revoke all on public.accounting_allocation_snapshots from public,anon,authenticated;
grant all on public.accounting_allocation_snapshots to service_role;
alter table public.accounting_credit_notes add column if not exists reversed_at timestamptz,add column if not exists reversal_journal_id uuid references public.accounting_journals(id);
create table if not exists public.accounting_refunds (
  id uuid primary key, number text not null unique,
  receipt_id uuid not null references public.accounting_receipts(id),
  amount_cents bigint not null check(amount_cents>0),
  paid_on date not null, method text not null check(method in ('EFT','Cash')),
  reference text not null, reason text not null,
  actor_id uuid not null references auth.users(id), journal_id uuid not null references public.accounting_journals(id),
  reversed_at timestamptz, reversal_journal_id uuid references public.accounting_journals(id),
  created_at timestamptz not null default now(), unique(method,reference)
);
alter table public.accounting_receipts add column if not exists replaces_receipt_id uuid references public.accounting_receipts(id);
alter table public.accounting_receipts drop constraint if exists accounting_receipts_method_reference_key;
alter table public.accounting_refunds drop constraint if exists accounting_refunds_method_reference_key;
create unique index if not exists accounting_receipt_active_reference on public.accounting_receipts(method,reference) where reversed_at is null;
create unique index if not exists accounting_refund_active_reference on public.accounting_refunds(method,reference) where reversed_at is null;

create table if not exists public.accounting_suppliers (
  id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
  email text, phone text, created_at timestamptz not null default now()
);
create table if not exists public.accounting_bills (
  id uuid primary key, number text not null unique,
  supplier_id uuid not null references public.accounting_suppliers(id),
  category text not null references public.accounting_accounts(code),
  description text not null, issued_on date not null, due_on date not null,
  amount_cents bigint not null check(amount_cents>0 and amount_cents<=2000000000),
  actor_id uuid not null references auth.users(id), journal_id uuid not null references public.accounting_journals(id),
  reversed_at timestamptz, reversal_journal_id uuid references public.accounting_journals(id),
  created_at timestamptz not null default now()
);
create table if not exists public.accounting_bill_payments (
  id uuid primary key, bill_id uuid not null references public.accounting_bills(id),
  amount_cents bigint not null check(amount_cents>0),
  paid_on date not null, method text not null check(method in ('EFT','Cash')),
  reference text not null, note text not null,
  actor_id uuid not null references auth.users(id), journal_id uuid not null references public.accounting_journals(id),
  reversed_at timestamptz, reversal_journal_id uuid references public.accounting_journals(id),
  created_at timestamptz not null default now(), unique(method,reference)
);
alter table public.accounting_bill_payments drop constraint if exists accounting_bill_payments_method_reference_key;
create unique index if not exists accounting_bill_payment_active_reference on public.accounting_bill_payments(method,reference) where reversed_at is null;

create table if not exists public.accounting_statement_batches (
  id uuid primary key, fingerprint text not null unique, name text not null,
  account_code text not null references public.accounting_accounts(code) check(account_code='1000'),
  from_date date not null, to_date date not null check(to_date>=from_date),
  opening_cents bigint not null, closing_cents bigint not null,
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.accounting_statement_lines (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.accounting_statement_batches(id),
  external_id text not null unique, posted_on date not null,
  description text not null, amount_cents bigint not null check(amount_cents<>0),
  matched_journal_id uuid unique references public.accounting_journals(id),
  matched_at timestamptz, matched_by uuid references auth.users(id)
);
alter table public.accounting_statement_batches add column if not exists voided_at timestamptz,add column if not exists void_reason text;
alter table public.accounting_statement_lines add column if not exists voided boolean not null default false;
alter table public.accounting_statement_batches drop constraint if exists accounting_statement_batches_fingerprint_key;
alter table public.accounting_statement_lines drop constraint if exists accounting_statement_lines_external_id_key;
create unique index if not exists accounting_active_statement_file on public.accounting_statement_batches(fingerprint) where voided_at is null;
create unique index if not exists accounting_active_bank_id on public.accounting_statement_lines(external_id) where not voided;
create table if not exists public.accounting_reconciliation_events (
  id uuid primary key default gen_random_uuid(), statement_line_id uuid not null references public.accounting_statement_lines(id),
  journal_id uuid not null references public.accounting_journals(id), action text not null check(action in ('match','unmatch')),
  reason text not null, actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.accounting_bank_timing (
  id uuid primary key default gen_random_uuid(), journal_id uuid not null unique references public.accounting_journals(id),
  expected_on date not null, reason text not null, actor_id uuid not null references auth.users(id),
  withdrawn_at timestamptz, withdrawal_reason text, created_at timestamptz not null default now()
);
create table if not exists public.accounting_period_events (
  id uuid primary key default gen_random_uuid(), action text not null check(action in ('close','reopen')),
  through_date date not null, reason text not null, actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.accounting_runs (
  id uuid primary key default gen_random_uuid(), run_on date not null unique,
  state text not null check(state in ('completed','failed')), attempts integer not null default 1,
  result jsonb not null default '{}', last_error text,
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(), finished_at timestamptz not null default now()
);
create table if not exists public.accounting_attachments (
  id uuid primary key default gen_random_uuid(), bill_id uuid not null references public.accounting_bills(id),
  name text not null, mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check(size_bytes between 1 and 10485760), storage_path text not null unique,
  finalized_at timestamptz, actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('accounting-documents','accounting-documents',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.applications
  add column if not exists enrollment_state text not null default 'not_enrolled' check(enrollment_state in ('not_enrolled','active','suspended','withdrawn')),
  add column if not exists billing_end_date date,
  add column if not exists withdrawn_on date,
  add column if not exists lifecycle_reason text,
  add column if not exists arrangement_until date,
  add column if not exists arrangement_note text;
alter table public.tuition_invoices
  add column if not exists credited_cents bigint not null default 0,
  add column if not exists recognised_cents bigint not null default 0,
  add column if not exists earning_dates date[] not null default '{}',
  add column if not exists journal_id uuid references public.accounting_journals(id);
alter table public.tuition_messages alter column invoice_id drop not null;
alter table public.tuition_messages drop constraint if exists tuition_messages_kind_check;
alter table public.tuition_messages add constraint tuition_messages_kind_check check(kind in ('invoice','receipt','reminder','activation','account_receipt','credit_note','refund','allocation'));

-- Only the server can access accounting tables. Domain functions do their own role check.
do $$ declare t text; begin
  foreach t in array array['accounting_settings','accounting_accounts','accounting_journals','accounting_lines','accounting_counters','accounting_receipts','accounting_allocation_releases','accounting_credit_notes','accounting_refunds','accounting_suppliers','accounting_bills','accounting_bill_payments','accounting_statement_batches','accounting_statement_lines','accounting_bank_timing','accounting_reconciliation_events','accounting_period_events','accounting_runs','accounting_attachments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.accounting_assert(p_actor uuid,p_owner boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.admin_assert(p_actor);
  if not exists(select 1 from public.admin_users where user_id=p_actor and finance_role in ('owner','bookkeeper') and (not p_owner or finance_role='owner')) then
    raise exception 'Your finance role does not permit this action.';
  end if;
end $$;
create or replace function public.accounting_audit(p_actor uuid,p_action text,p_data jsonb,p_application uuid default null) returns void
language sql security definer set search_path='' as $$
  insert into public.admin_audit(actor_id,action,application_id,details) values(p_actor,p_action,p_application,p_data);
$$;
create or replace function public.accounting_next_number(p_kind text,p_date date) returns text
language plpgsql security definer set search_path='' as $$
declare n bigint; begin
  insert into public.accounting_counters(kind,month,last_number) values(p_kind,date_trunc('month',p_date)::date,1)
    on conflict(kind,month) do update set last_number=public.accounting_counters.last_number+1 returning last_number into n;
  return 'VT-'||p_kind||'-'||to_char(p_date,'YYYYMM')||case when n<10 then '0' else '' end||n;
end $$;
create or replace function public.accounting_immutable() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'Posted accounting history is immutable. Record a reversal instead.'; end $$;
do $$ declare t text; begin
  foreach t in array array['accounting_journals','accounting_lines','accounting_allocation_releases','accounting_allocation_snapshots','accounting_credit_notes','accounting_reconciliation_events','accounting_period_events'] loop
    execute format('drop trigger if exists accounting_immutable on public.%I',t);
    execute format('create trigger accounting_immutable before update or delete on public.%I for each row execute function public.accounting_immutable()',t);
  end loop;
end $$;
create or replace function public.accounting_balanced() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count integer; v_sum numeric;
begin
  if tg_table_name='accounting_journals' then v_id=new.id; else v_id=new.journal_id; end if;
  select count(*),coalesce(sum(amount_cents),0) into v_count,v_sum from public.accounting_lines where journal_id=v_id;
  if v_count<2 or v_sum<>0 then raise exception 'Every journal must have at least two balanced lines.'; end if;
  return null;
end $$;
drop trigger if exists accounting_balance on public.accounting_journals;
create constraint trigger accounting_balance after insert on public.accounting_journals deferrable initially deferred for each row execute function public.accounting_balanced();
drop trigger if exists accounting_balance on public.accounting_lines;
create constraint trigger accounting_balance after insert on public.accounting_lines deferrable initially deferred for each row execute function public.accounting_balanced();

create or replace function public.accounting_post(p_actor uuid,p_key text,p_date date,p_description text,p_kind text,p_source uuid,p_lines jsonb,p_reversal uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.accounting_settings; v_id uuid; v_line jsonb; v_sum numeric=0; v_cash bigint;
begin
  perform public.accounting_assert(p_actor);
  select * into s from public.accounting_settings where singleton for update;
  if p_date is null or p_date<s.books_start or p_date>public.tuition_today() then raise exception 'Choose a posting date within the open books and not in the future.'; end if;
  if s.closed_through is not null and p_date<=s.closed_through then raise exception 'This accounting period is closed.'; end if;
  select id into v_id from public.accounting_journals where event_key=p_key;
  if v_id is not null then return v_id; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Supply journal lines as an array.'; end if;
  if length(trim(coalesce(p_description,'')))<5 or jsonb_array_length(p_lines)<2 or jsonb_array_length(p_lines)>100 then raise exception 'A journal needs a description and two to 100 lines.'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if not exists(select 1 from public.accounting_accounts where code=v_line->>'account' and active) or
       coalesce(v_line->>'cents','') !~ '^-?[0-9]+$' or (v_line->>'cents')::bigint=0 or abs((v_line->>'cents')::bigint)>2000000000 then raise exception 'Supply valid active accounts and integer cents for every journal line.'; end if;
    v_sum=v_sum+(v_line->>'cents')::bigint;
  end loop;
  if v_sum<>0 then raise exception 'Journal debits and credits must balance.'; end if;
  insert into public.accounting_journals(event_key,posted_on,description,source_kind,source_id,actor_id,reversal_of)
    values(p_key,p_date,p_description,p_kind,p_source,p_actor,p_reversal) returning id into v_id;
  insert into public.accounting_lines(journal_id,account_code,amount_cents,application_id,invoice_id)
    select v_id,x->>'account',(x->>'cents')::bigint,nullif(x->>'applicationId','')::uuid,nullif(x->>'invoiceId','')::uuid from jsonb_array_elements(p_lines) x;
  -- Only cash outflows need the historical cash-count check.
  if coalesce((select sum((x->>'cents')::bigint) from jsonb_array_elements(p_lines)x where x->>'account'='1010'),0)<0 then
    select min(running) into v_cash from (
      select sum(sum(l.amount_cents)) over(order by j.posted_on) as running from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id where l.account_code='1010' group by j.posted_on
    ) q;
    if v_cash<0 then raise exception 'Cash on hand would become negative. Record funds received or correct the date first.'; end if;
  end if;
  return v_id;
end $$;
create or replace function public.accounting_reverse(p_actor uuid,p_journal uuid,p_id uuid,p_date date,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.accounting_journals; v_lines jsonb;
begin
  perform public.accounting_assert(p_actor);
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'A reversal reason of at least five characters is required.'; end if;
  select * into j from public.accounting_journals where id=p_journal;
  if j.id is null then raise exception 'Journal not found.'; end if;
  if exists(select 1 from public.accounting_statement_lines where matched_journal_id=j.id) then raise exception 'Unmatch the reconciled bank transaction before reversing this entry.'; end if;
  if exists(select 1 from public.accounting_journals where reversal_of=j.id) then raise exception 'This journal has already been reversed.'; end if;
  select jsonb_agg(jsonb_build_object('account',account_code,'cents',-amount_cents,'applicationId',application_id,'invoiceId',invoice_id)) into v_lines from public.accounting_lines where journal_id=j.id;
  update public.accounting_bank_timing set withdrawn_at=now(),withdrawal_reason='Ledger entry reversed: '||p_reason where journal_id=j.id and withdrawn_at is null;
  return public.accounting_post(p_actor,'reverse:'||p_id,p_date,'Reversal: '||p_reason,'reversal',p_id,v_lines,j.id);
end $$;
create or replace function public.accounting_allocation_net(p_payment uuid) returns bigint
language sql stable security definer set search_path='' as $$
  select p.amount_cents-coalesce((select sum(amount_cents) from public.accounting_allocation_releases where payment_id=p.id),0) from public.tuition_payments p where p.id=p_payment;
$$;
create or replace function public.accounting_invoice_paid(p_invoice uuid) returns bigint
language sql stable security definer set search_path='' as $$ select coalesce(sum(public.accounting_allocation_net(id)),0)::bigint from public.tuition_payments where invoice_id=p_invoice; $$;
create or replace function public.accounting_invoice_balance(p_invoice uuid) returns bigint
language sql stable security definer set search_path='' as $$ select amount_cents-credited_cents-public.accounting_invoice_paid(id) from public.tuition_invoices where id=p_invoice; $$;
create or replace function public.accounting_receipt_available(p_receipt uuid) returns bigint
language sql stable security definer set search_path='' as $$
  select case when r.reversed_at is not null then 0 else r.amount_cents-
    coalesce((select sum(public.accounting_allocation_net(id)) from public.tuition_payments where receipt_id=r.id),0)-
    coalesce((select sum(amount_cents) from public.accounting_refunds where receipt_id=r.id and reversed_at is null),0) end from public.accounting_receipts r where r.id=p_receipt;
$$;

-- Private helper functions are not RPCs for browser roles.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'accounting_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';


-- Domain operations post balanced journals and business records in one transaction.
alter table public.applications add column if not exists activation_invoice_id uuid references public.tuition_invoices(id);

create or replace function public.accounting_prepare_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if extract(month from new.billing_month) not between 2 and 11 then raise exception 'Routine tuition billing runs February to November only.'; end if;
  select coalesce(array_agg(d::date order by d),'{}') into new.earning_dates
    from generate_series(new.period_start::timestamp,new.period_end::timestamp,interval '1 day') d
    where extract(isodow from d)::integer=any(new.programme_weekdays) and not exists(select 1 from public.tuition_closures c where c.day=d::date);
  if cardinality(new.earning_dates)<>new.remaining_days then raise exception 'The issued programme calendar must match the billed days.'; end if;
  return new;
end $$;
drop trigger if exists accounting_prepare_invoice on public.tuition_invoices;
create trigger accounting_prepare_invoice before insert on public.tuition_invoices for each row execute function public.accounting_prepare_invoice();
create or replace function public.accounting_post_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_journal uuid;
begin
  v_journal=public.accounting_post(new.created_by,'invoice:'||new.id,public.tuition_today(),'Tuition invoice '||new.number,'invoice',new.id,
    jsonb_build_array(jsonb_build_object('account','1100','cents',new.amount_cents,'applicationId',new.application_id,'invoiceId',new.id),jsonb_build_object('account','2000','cents',-new.amount_cents,'applicationId',new.application_id,'invoiceId',new.id)));
  update public.tuition_invoices set journal_id=v_journal where id=new.id;
  return new;
end $$;
drop trigger if exists accounting_post_invoice on public.tuition_invoices;
create trigger accounting_post_invoice after insert on public.tuition_invoices for each row execute function public.accounting_post_invoice();
create or replace function public.accounting_protect_invoice() returns trigger
language plpgsql set search_path='' as $$
begin
  if (to_jsonb(new)-array['credited_cents','recognised_cents','journal_id'])<>(to_jsonb(old)-array['credited_cents','recognised_cents','journal_id']) then
    raise exception 'Issued invoice details cannot be edited. Record a credit note instead.';
  end if;
  if new.credited_cents<0 or new.recognised_cents<0 or new.credited_cents+new.recognised_cents>new.amount_cents then raise exception 'Invalid invoice credit or earned amount.'; end if;
  return new;
end $$;
drop trigger if exists accounting_protect_invoice on public.tuition_invoices;
create trigger accounting_protect_invoice before update on public.tuition_invoices for each row execute function public.accounting_protect_invoice();
create or replace function public.admin_create_invoice(p_actor uuid,p_application uuid,p_month date,p_start date) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.applications; programme public.tuition_programmes; v_end date; v_total integer; v_remaining integer; v_id uuid;
begin
  perform public.accounting_assert(p_actor);
  select * into a from public.applications where id=p_application for update;
  if a.id is null or a.monthly_fee<=0 then raise exception 'A valid application fee is required.'; end if;
  if p_month is null or p_start is null or extract(day from p_month)<>1 or date_trunc('month',p_start)::date<>p_month then raise exception 'The start date must be in the billing month.'; end if;
  if extract(month from p_month) not between 2 and 11 then raise exception 'Routine tuition billing runs February to November only.'; end if;
  select * into programme from public.tuition_programmes where grade=a.grade_level;
  if programme.grade is null then raise exception 'A billing programme must be configured for this grade.'; end if;
  v_end=least((p_month+interval '1 month - 1 day')::date,coalesce(a.billing_end_date,'infinity'::date));
  if v_end<p_start then raise exception 'The learner billing end date is before this invoice period.'; end if;
  select count(*),count(*) filter(where d::date between p_start and v_end) into v_total,v_remaining
    from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day') d
    where extract(isodow from d)::integer=any(programme.weekdays) and not exists(select 1 from public.tuition_closures c where c.day=d::date);
  if v_remaining=0 then raise exception 'No teaching days remain in this period.'; end if;
  insert into public.tuition_invoices(application_id,billing_month,period_start,period_end,due_date,monthly_fee,teaching_days,remaining_days,programme_label,programme_weekdays,amount_cents,created_by)
  values(a.id,p_month,p_start,v_end,p_start,a.monthly_fee,v_total,v_remaining,programme.label,programme.weekdays,round(a.monthly_fee*100*v_remaining/v_total),p_actor)
  on conflict(application_id,billing_month) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.tuition_invoices where application_id=a.id and billing_month=p_month; end if;
  perform public.admin_queue(v_id,'invoice','invoice:'||v_id);
  return v_id;
end $$;
create or replace function public.admin_queue(p_invoice uuid,p_kind text,p_key text,p_extra jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.tuition_messages(invoice_id,kind,event_key,payload)
  select i.id,p_kind,p_key,jsonb_build_object(
    'invoiceNumber',i.number,'studentNumber',l.student_number,'learner',a.learner_name,
    'recipients',jsonb_build_array(a.guardian_email,a.learner_email),'month',i.billing_month,
    'dueDate',i.due_date,'amountCents',i.amount_cents,'monthlyFee',i.monthly_fee,
    'remainingDays',i.remaining_days,'teachingDays',i.teaching_days,'creditedCents',i.credited_cents,
    'balanceCents',public.accounting_invoice_balance(i.id)
  ) || p_extra
  from public.tuition_invoices i join public.applications a on a.id=i.application_id
  join public.learners l on l.application_id=a.id where i.id=p_invoice on conflict(event_key) do nothing;
end $$;
create or replace function public.accounting_queue(p_kind text,p_id uuid,p_invoice uuid,p_payload jsonb) returns void
language sql security definer set search_path='' as $$
  insert into public.tuition_messages(invoice_id,kind,event_key,payload) values(p_invoice,p_kind,p_kind||':'||p_id,p_payload||jsonb_build_object('applicationId',coalesce((select application_id from public.tuition_invoices where id=p_invoice),(select application_id from public.accounting_receipts where id=p_id),(select r.application_id from public.accounting_refunds f join public.accounting_receipts r on r.id=f.receipt_id where f.id=p_id)))) on conflict(event_key) do nothing;
$$;

create or replace function public.accounting_allocate(p_actor uuid,p_receipt uuid,p_invoice uuid,p_amount bigint,p_id uuid,p_legacy boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.accounting_receipts; i public.tuition_invoices; a public.applications; v_journal uuid; old public.tuition_payments;
begin
  perform public.accounting_assert(p_actor);
  select * into r from public.accounting_receipts where id=p_receipt for update;
  select * into i from public.tuition_invoices where id=p_invoice for update;
  select * into a from public.applications where id=i.application_id;
  if r.id is null or i.id is null or r.reversed_at is not null then raise exception 'Choose a valid receipt and invoice.'; end if;
  select * into old from public.tuition_payments where id=p_id;
  if old.id is not null then
    if old.receipt_id<>p_receipt or old.invoice_id<>p_invoice or old.amount_cents<>p_amount then raise exception 'This allocation request already has different details.'; end if;
    return old.id;
  end if;
  if lower(trim(a.guardian_email))<>r.billing_email then raise exception 'Allocate only to invoices belonging to the same parent or guardian account.'; end if;
  if p_amount is null or p_amount<=0 or p_amount>public.accounting_receipt_available(r.id) then raise exception 'The allocation exceeds the available family credit.'; end if;
  if p_amount>public.accounting_invoice_balance(i.id) then raise exception 'The allocation exceeds the outstanding invoice balance.'; end if;
  v_journal=public.accounting_post(p_actor,'allocation:'||p_id,public.tuition_today(),'Allocate receipt '||r.number||' to '||i.number,'allocation',p_id,
    jsonb_build_array(jsonb_build_object('account','2100','cents',p_amount,'applicationId',r.application_id),jsonb_build_object('account','1100','cents',-p_amount,'applicationId',i.application_id,'invoiceId',i.id)));
  insert into public.tuition_payments(id,invoice_id,receipt_id,amount_cents,paid_on,method,transaction_reference,note,verified_by)
    values(p_id,i.id,r.id,p_amount,r.paid_on,r.method,r.reference,r.note,p_actor);
  insert into public.accounting_allocation_snapshots(payment_id,balance_cents) values(p_id,public.accounting_invoice_balance(i.id));
  if p_legacy then
    perform public.admin_queue(i.id,'receipt','receipt:'||p_id,jsonb_build_object('paymentId',p_id,'receiptId',r.id,'paidCents',p_amount,'paidOn',r.paid_on,'method',r.method));
  end if;
  return p_id;
end $$;

create or replace function public.accounting_receive(p_actor uuid,p_data jsonb,p_legacy boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a public.applications; r public.accounting_receipts; v_id uuid=(p_data->>'id')::uuid;
  v_amount bigint=(p_data->>'amountCents')::bigint; v_date date=(p_data->>'paidOn')::date;
  v_method text=p_data->>'method'; v_ref text=upper(trim(coalesce(p_data->>'reference','')));
  v_note text=trim(coalesce(p_data->>'note','')); v_journal uuid; v_number text; x jsonb; v_allocation uuid;
  v_items jsonb='[]'; v_total bigint=0; v_invoice uuid; v_payload jsonb;
begin
  perform public.accounting_assert(p_actor);
  perform 1 from public.accounting_settings where singleton for update;
  if v_id is null or v_amount is null or v_amount<=0 or v_amount>2000000000 or v_date is null or v_date>public.tuition_today() or v_method is null or v_method not in ('EFT','Cash') or length(v_ref) not between 3 and 120 or length(v_note) not between 5 and 2000 then raise exception 'Supply a valid amount, EFT/Cash method, date, unique transaction reference and verification note.'; end if;
  select * into a from public.applications where id=(p_data->>'applicationId')::uuid;
  if a.id is null then raise exception 'Choose a learner or family account.'; end if;
  select * into r from public.accounting_receipts where id=v_id;
  if r.id is not null then
    if r.amount_cents<>v_amount or r.paid_on<>v_date or r.method<>v_method or r.reference<>v_ref or r.application_id<>a.id then raise exception 'This payment request was already used with different details.'; end if;
    return jsonb_build_object('receiptId',r.id,'number',r.number,'alreadyRecorded',true);
  end if;
  if exists(select 1 from public.accounting_receipts where method=v_method and reference=v_ref and reversed_at is null) then raise exception 'This transaction reference has already been recorded for this method.'; end if;
  v_number=public.accounting_next_number('RC',v_date);
  v_journal=public.accounting_post(p_actor,'receipt:'||v_id,v_date,'Money received '||v_number,'receipt',v_id,
    jsonb_build_array(jsonb_build_object('account',case when v_method='Cash' then '1010' else '1000' end,'cents',v_amount,'applicationId',a.id),jsonb_build_object('account','2100','cents',-v_amount,'applicationId',a.id)));
  insert into public.accounting_receipts(id,number,application_id,billing_email,payer_name,amount_cents,paid_on,method,reference,note,actor_id,journal_id,replaces_receipt_id)
    values(v_id,v_number,a.id,lower(trim(a.guardian_email)),a.guardian_name,v_amount,v_date,v_method,v_ref,v_note,p_actor,v_journal,(select id from public.accounting_receipts where method=v_method and reference=v_ref and reversed_at is not null order by created_at desc limit 1));
  if jsonb_typeof(coalesce(p_data->'allocations','[]'))<>'array' or jsonb_array_length(coalesce(p_data->'allocations','[]'))>50 then raise exception 'Supply up to 50 invoice allocations.'; end if;
  for x in select value from jsonb_array_elements(coalesce(p_data->'allocations','[]')) loop
    v_invoice=(x->>'invoiceId')::uuid;
    v_allocation=case when p_legacy then v_id else gen_random_uuid() end;
    perform public.accounting_allocate(p_actor,v_id,v_invoice,(x->>'amountCents')::bigint,v_allocation,p_legacy);
    v_total=v_total+(x->>'amountCents')::bigint;
    v_items=v_items||jsonb_build_array(jsonb_build_object('description','Allocated to '||(select number from public.tuition_invoices where id=v_invoice),'cents',(x->>'amountCents')::bigint));
  end loop;
  if v_amount>v_total then v_items=v_items||jsonb_build_array(jsonb_build_object('description','Available family credit','cents',v_amount-v_total)); end if;
  if not p_legacy then
    v_payload=jsonb_build_object('documentKind','account_receipt','documentId',v_id,'documentNumber',v_number,'title','Payment receipt','learner',a.learner_name,'payer',a.guardian_name,'recipients',jsonb_build_array(a.guardian_email),'issuedOn',v_date,'method',v_method,'reference',v_ref,'items',v_items,'totalCents',v_amount,'creditCents',v_amount-v_total,'note','This receipt records the payment and allocations shown. Other invoices may remain outstanding.');
    perform public.accounting_queue('account_receipt',v_id,v_invoice,v_payload);
  end if;
  return jsonb_build_object('receiptId',v_id,'number',v_number,'journalId',v_journal);
end $$;

create or replace function public.accounting_release(p_actor uuid,p_payment uuid,p_amount bigint,p_date date,p_reason text,p_key text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.tuition_payments; r public.accounting_receipts; i public.tuition_invoices; v_journal uuid;
begin
  select * into p from public.tuition_payments where id=p_payment for update;
  select * into r from public.accounting_receipts where id=p.receipt_id;
  select * into i from public.tuition_invoices where id=p.invoice_id;
  if p_amount<=0 or p_amount>public.accounting_allocation_net(p.id) then raise exception 'Invalid allocation release.'; end if;
  v_journal=public.accounting_post(p_actor,p_key,p_date,p_reason,'release',p.id,
    jsonb_build_array(jsonb_build_object('account','1100','cents',p_amount,'applicationId',i.application_id,'invoiceId',i.id),jsonb_build_object('account','2100','cents',-p_amount,'applicationId',r.application_id)));
  insert into public.accounting_allocation_releases(payment_id,amount_cents,reason,journal_id) values(p.id,p_amount,p_reason,v_journal);
end $$;

create or replace function public.accounting_credit(p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.tuition_invoices; a public.applications; c public.accounting_credit_notes; v_id uuid=(p_data->>'id')::uuid;
  v_amount bigint=(p_data->>'amountCents')::bigint; v_reason text=trim(coalesce(p_data->>'reason',''));
  v_date date=public.tuition_today(); v_deferred bigint; v_revenue bigint; v_over bigint; v_part bigint; v_journal uuid; v_number text; v_lines jsonb='[]'; p record;
begin
  perform public.accounting_assert(p_actor);
  perform 1 from public.accounting_settings where singleton for update;
  select * into c from public.accounting_credit_notes where id=v_id;
  if c.id is not null then
    if c.invoice_id<>(p_data->>'invoiceId')::uuid or c.amount_cents<>v_amount or c.reason<>v_reason then raise exception 'This credit request has different details.'; end if;
    return jsonb_build_object('creditNoteId',c.id,'number',c.number,'alreadyRecorded',true);
  end if;
  select * into i from public.tuition_invoices where id=(p_data->>'invoiceId')::uuid for update;
  if i.id is null or v_id is null or v_amount is null or v_amount<=0 or v_amount>i.amount_cents-i.credited_cents or length(v_reason) not between 5 and 2000 then raise exception 'Choose an invoice, valid credit amount and a reason of at least five characters.'; end if;
  select * into a from public.applications where id=i.application_id;
  v_number=public.accounting_next_number('CN',v_date);
  v_deferred=least(v_amount,i.amount_cents-i.credited_cents-i.recognised_cents); v_revenue=v_amount-v_deferred;
  if v_deferred>0 then v_lines=v_lines||jsonb_build_array(jsonb_build_object('account','2000','cents',v_deferred,'applicationId',a.id,'invoiceId',i.id)); end if;
  if v_revenue>0 then v_lines=v_lines||jsonb_build_array(jsonb_build_object('account','4000','cents',v_revenue,'applicationId',a.id,'invoiceId',i.id)); end if;
  v_lines=v_lines||jsonb_build_array(jsonb_build_object('account','1100','cents',-v_amount,'applicationId',a.id,'invoiceId',i.id));
  v_journal=public.accounting_post(p_actor,'credit:'||v_id,v_date,'Credit note '||v_number,'credit_note',v_id,v_lines);
  insert into public.accounting_credit_notes(id,number,invoice_id,amount_cents,reason,issued_on,actor_id,journal_id) values(v_id,v_number,i.id,v_amount,v_reason,v_date,p_actor,v_journal);
  update public.tuition_invoices set credited_cents=credited_cents+v_amount,recognised_cents=recognised_cents-v_revenue where id=i.id;
  v_over=greatest(0,-public.accounting_invoice_balance(i.id));
  for p in select id from public.tuition_payments where invoice_id=i.id order by created_at desc,id loop
    exit when v_over=0;
    v_part=least(v_over,public.accounting_allocation_net(p.id));
    if v_part>0 then perform public.accounting_release(p_actor,p.id,v_part,v_date,'Release credit note overpayment '||v_number,'credit-release:'||v_id||':'||p.id); v_over=v_over-v_part; end if;
  end loop;
  perform public.accounting_queue('credit_note',v_id,i.id,jsonb_build_object('documentKind','credit_note','documentId',v_id,'documentNumber',v_number,'title','Credit note','learner',a.learner_name,'payer',a.guardian_name,'recipients',jsonb_build_array(a.guardian_email,a.learner_email),'issuedOn',v_date,'items',jsonb_build_array(jsonb_build_object('description','Credit against '||i.number,'cents',v_amount)),'totalCents',v_amount,'note',v_reason));
  return jsonb_build_object('creditNoteId',v_id,'number',v_number);
end $$;

create or replace function public.accounting_recognise(p_actor uuid,p_through date) returns bigint
language plpgsql security definer set search_path='' as $$
declare i public.tuition_invoices; v_target bigint; v_amount bigint; v_count bigint=0;
begin
  perform public.accounting_assert(p_actor);
  perform 1 from public.accounting_settings where singleton for update;
  if p_through is null or p_through>public.tuition_today() then raise exception 'Recognise tuition only through today or an earlier date.'; end if;
  for i in select * from public.tuition_invoices where period_start<=p_through and amount_cents>credited_cents+recognised_cents order by id for update loop
    v_target=round((i.amount_cents-i.credited_cents)::numeric*(select count(*) from unnest(i.earning_dates) d where d<=p_through)/greatest(1,cardinality(i.earning_dates)));
    v_amount=greatest(0,v_target-i.recognised_cents);
    if v_amount>0 then
      perform public.accounting_post(p_actor,'earned:'||i.id||':'||v_target,case when i.period_end<=coalesce((select closed_through from public.accounting_settings where singleton),'-infinity'::date) then p_through else least(p_through,i.period_end) end,'Earned tuition '||i.number,'recognition',i.id,
        jsonb_build_array(jsonb_build_object('account','2000','cents',v_amount,'applicationId',i.application_id,'invoiceId',i.id),jsonb_build_object('account','4000','cents',-v_amount,'applicationId',i.application_id,'invoiceId',i.id)));
      update public.tuition_invoices set recognised_cents=recognised_cents+v_amount where id=i.id; v_count=v_count+1;
    end if;
  end loop;
  update public.accounting_settings set recognised_through=greatest(coalesce(recognised_through,p_through),p_through) where singleton;
  return v_count;
end $$;

-- Explicit immutable fields on allocations: releases are separate history rows.
drop trigger if exists accounting_immutable on public.tuition_payments;
create trigger accounting_immutable before update or delete on public.tuition_payments for each row execute function public.accounting_immutable();
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'accounting_%' or p.proname in ('admin_queue','admin_create_invoice')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;


create table if not exists public.accounting_requests (
  id uuid primary key, action text not null, payload jsonb not null, result jsonb not null,
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.accounting_requests enable row level security;
revoke all on public.accounting_requests from public,anon,authenticated;
grant all on public.accounting_requests to service_role;
drop trigger if exists accounting_immutable on public.accounting_requests;
create trigger accounting_immutable before update or delete on public.accounting_requests for each row execute function public.accounting_immutable();
alter table public.accounting_bills add column if not exists supplier_name text not null default '';

create or replace function public.accounting_pay_bill(p_actor uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.accounting_bills; v_id uuid=(p_data->>'id')::uuid; v_amount bigint=(p_data->>'amountCents')::bigint;
  v_date date=(p_data->>'paidOn')::date; v_method text=p_data->>'method'; v_ref text=upper(trim(coalesce(p_data->>'reference','')));
  v_note text=trim(coalesce(p_data->>'note','')); v_paid bigint; v_journal uuid;
begin
  select * into b from public.accounting_bills where id=(p_data->>'billId')::uuid for update;
  if b.id is null or b.reversed_at is not null then raise exception 'Choose an outstanding supplier bill.'; end if;
  select coalesce(sum(amount_cents),0) into v_paid from public.accounting_bill_payments where bill_id=b.id and reversed_at is null;
  if v_id is null or v_amount is null or v_amount<=0 or v_amount>b.amount_cents-v_paid or v_date is null or v_date<b.issued_on or v_method is null or v_method not in ('EFT','Cash') or length(v_ref) not between 3 and 120 or length(v_note)<5 then raise exception 'Supply a valid bill payment, date, EFT/Cash method, unique reference and verification note.'; end if;
  if exists(select 1 from public.accounting_bill_payments where method=v_method and reference=v_ref and reversed_at is null) or exists(select 1 from public.accounting_refunds where method=v_method and reference=v_ref and reversed_at is null) then raise exception 'This outgoing transaction reference has already been recorded.'; end if;
  v_journal=public.accounting_post(p_actor,'bill-payment:'||v_id,v_date,'Pay supplier bill '||b.number,'bill_payment',v_id,
    jsonb_build_array(jsonb_build_object('account','2200','cents',v_amount),jsonb_build_object('account',case when v_method='Cash' then '1010' else '1000' end,'cents',-v_amount)));
  insert into public.accounting_bill_payments(id,bill_id,amount_cents,paid_on,method,reference,note,actor_id,journal_id)
    values(v_id,b.id,v_amount,v_date,v_method,v_ref,v_note,p_actor,v_journal);
  return v_id;
end $$;

create or replace function public.accounting_match(p_actor uuid,p_line uuid,p_journal uuid,p_reason text,p_unmatch boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare l public.accounting_statement_lines; j public.accounting_journals; s public.accounting_settings; v_amount bigint;
begin
  perform public.accounting_assert(p_actor);
  select * into s from public.accounting_settings where singleton for update;
  select * into l from public.accounting_statement_lines where id=p_line for update;
  if l.id is null or l.voided or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Choose a bank transaction and record why it matches or needs unmatching.'; end if;
  if s.closed_through is not null and l.posted_on<=s.closed_through then raise exception 'Reopen the closed accounting period before changing its reconciliation.'; end if;
  if p_unmatch then
    if l.matched_journal_id is null then raise exception 'This bank transaction is not matched.'; end if;
    p_journal=l.matched_journal_id;
    update public.accounting_statement_lines set matched_journal_id=null,matched_at=null,matched_by=null where id=l.id;
  else
    select * into j from public.accounting_journals where id=p_journal;
    if j.id is null or l.matched_journal_id is not null then raise exception 'Choose an unmatched bank transaction and existing ledger entry.'; end if;
    if exists(select 1 from public.accounting_journals where reversal_of=j.id) or j.reversal_of is not null then raise exception 'Choose an unreversed bank entry.'; end if;
    select coalesce(sum(amount_cents),0) into v_amount from public.accounting_lines where journal_id=j.id and account_code='1000';
    if v_amount<>l.amount_cents then raise exception 'The bank transaction and ledger entry must have the same signed amount.'; end if;
    if exists(select 1 from public.accounting_statement_lines where matched_journal_id=j.id) then raise exception 'This ledger entry is already matched to a bank transaction.'; end if;
    update public.accounting_statement_lines set matched_journal_id=j.id,matched_at=now(),matched_by=p_actor where id=l.id;
  end if;
  insert into public.accounting_reconciliation_events(statement_line_id,journal_id,action,reason,actor_id)
    values(l.id,p_journal,case when p_unmatch then 'unmatch' else 'match' end,trim(p_reason),p_actor);
end $$;

create or replace function public.accounting_mutate(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  s public.accounting_settings; req public.accounting_requests; a public.applications; i public.tuition_invoices;
  c public.accounting_credit_notes; r public.accounting_receipts; f public.accounting_refunds; b public.accounting_bills; bp public.accounting_bill_payments;
  v_request uuid=(p_data->>'requestId')::uuid; v_id uuid=coalesce(nullif(p_data->>'id','')::uuid,v_request);
  v_amount bigint; v_date date; v_method text; v_ref text; v_reason text=trim(coalesce(p_data->>'reason',p_data->>'note',''));
  v_journal uuid; v_number text; v_result jsonb='{}'; v_app uuid; x jsonb; p record; v_paid bigint; v_count integer=0;
  v_supplier uuid; v_category text; v_from date; v_to date; v_cash bigint; v_bank bigint; v_timing bigint; v_target uuid;
begin
  perform public.accounting_assert(p_actor);
  select * into s from public.accounting_settings where singleton for update;
  if v_request is null then raise exception 'A stable request ID is required.'; end if;
  select * into req from public.accounting_requests where id=v_request;
  if req.id is not null then
    if req.action<>p_action or req.payload<>p_data or req.actor_id<>p_actor then raise exception 'This request ID was already used with different details.'; end if;
    return req.result||jsonb_build_object('alreadyRecorded',true);
  end if;
  if length(v_reason)>2000 then raise exception 'Reasons and notes must be at most 2000 characters.'; end if;
  if p_action='receipt' then
    v_result=public.accounting_receive(p_actor,p_data||jsonb_build_object('id',v_id));
    v_app=(p_data->>'applicationId')::uuid;
  elsif p_action='allocate' then
    perform public.accounting_allocate(p_actor,(p_data->>'receiptId')::uuid,(p_data->>'invoiceId')::uuid,(p_data->>'amountCents')::bigint,v_id);
    select * into r from public.accounting_receipts where id=(p_data->>'receiptId')::uuid;
    select * into i from public.tuition_invoices where id=(p_data->>'invoiceId')::uuid;
    select * into a from public.applications where id=i.application_id;
    perform public.accounting_queue('allocation',v_id,i.id,jsonb_build_object('documentKind','allocation','documentId',v_id,'documentNumber',r.number||'-ALLOC-'||left(v_id::text,8),'title','Family credit allocated','learner',a.learner_name,'payer',r.payer_name,'recipients',jsonb_build_array(a.guardian_email,a.learner_email),'issuedOn',public.tuition_today(),'items',jsonb_build_array(jsonb_build_object('description','Existing credit allocated to '||i.number,'cents',(p_data->>'amountCents')::bigint)),'totalCents',(p_data->>'amountCents')::bigint,'note','This allocates an earlier payment. No additional money was received.'));
    v_app=a.id; v_result=jsonb_build_object('allocationId',v_id);
  elsif p_action='credit_note' then
    v_result=public.accounting_credit(p_actor,p_data||jsonb_build_object('id',v_id));
    select application_id into v_app from public.tuition_invoices where id=(p_data->>'invoiceId')::uuid;
  elsif p_action='reverse_credit_note' then
    select * into c from public.accounting_credit_notes where id=(p_data->>'creditNoteId')::uuid for update;
    if c.id is null or c.reversed_at is not null then raise exception 'Choose an unreversed credit note.'; end if;
    v_journal=public.accounting_reverse(p_actor,c.journal_id,v_id,public.tuition_today(),v_reason);
    select coalesce(sum(amount_cents),0) into v_amount from public.accounting_lines where journal_id=c.journal_id and account_code='4000';
    update public.accounting_credit_notes set reversed_at=now(),reversal_journal_id=v_journal where id=c.id;
    update public.tuition_invoices set credited_cents=credited_cents-c.amount_cents,recognised_cents=recognised_cents+v_amount where id=c.invoice_id;
    update public.tuition_messages set state='cancelled',cancelled_at=now(),cancelled_by=p_actor,cancellation_reason='Credit note reversed: '||v_reason where kind='credit_note' and payload->>'documentId'=c.id::text and state in ('pending','failed');
    select application_id into v_app from public.tuition_invoices where id=c.invoice_id;
    v_result=jsonb_build_object('journalId',v_journal,'invoiceId',c.invoice_id);
  elsif p_action='refund' then
    select * into r from public.accounting_receipts where id=(p_data->>'receiptId')::uuid for update;
    v_amount=(p_data->>'amountCents')::bigint; v_date=(p_data->>'paidOn')::date; v_method=p_data->>'method'; v_ref=upper(trim(coalesce(p_data->>'reference','')));
    if r.id is null or r.reversed_at is not null or v_amount is null or v_amount<=0 or v_amount>public.accounting_receipt_available(r.id) or v_method is null or v_method not in ('EFT','Cash') or v_date is null or length(v_ref) not between 3 and 120 or length(v_reason)<5 then raise exception 'Refund only available family credit and supply a valid date, EFT/Cash method, unique reference and reason.'; end if;
    if exists(select 1 from public.accounting_refunds where method=v_method and reference=v_ref and reversed_at is null) or exists(select 1 from public.accounting_bill_payments where method=v_method and reference=v_ref and reversed_at is null) then raise exception 'This outgoing transaction reference has already been recorded.'; end if;
    v_number=public.accounting_next_number('RF',v_date);
    v_journal=public.accounting_post(p_actor,'refund:'||v_id,v_date,'Family refund '||v_number,'refund',v_id,jsonb_build_array(jsonb_build_object('account','2100','cents',v_amount,'applicationId',r.application_id),jsonb_build_object('account',case when v_method='Cash' then '1010' else '1000' end,'cents',-v_amount,'applicationId',r.application_id)));
    insert into public.accounting_refunds(id,number,receipt_id,amount_cents,paid_on,method,reference,reason,actor_id,journal_id) values(v_id,v_number,r.id,v_amount,v_date,v_method,v_ref,v_reason,p_actor,v_journal);
    perform public.accounting_queue('refund',v_id,null,jsonb_build_object('documentKind','refund','documentId',v_id,'documentNumber',v_number,'title','Refund recorded','learner',r.payer_name,'payer',r.payer_name,'recipients',jsonb_build_array(r.billing_email),'issuedOn',v_date,'method',v_method,'reference',v_ref,'items',jsonb_build_array(jsonb_build_object('description','Refund from receipt '||r.number,'cents',v_amount)),'totalCents',v_amount,'note',v_reason));
    v_app=r.application_id; v_result=jsonb_build_object('refundId',v_id,'number',v_number);
  elsif p_action='reverse_receipt' then
    select * into r from public.accounting_receipts where id=(p_data->>'receiptId')::uuid for update;
    if r.id is null or r.reversed_at is not null or length(v_reason)<5 then raise exception 'Choose an unreversed receipt and give a correction reason.'; end if;
    if exists(select 1 from public.accounting_refunds where receipt_id=r.id and reversed_at is null) then raise exception 'Reverse existing refunds before reversing their original receipt.'; end if;
    for p in select id from public.tuition_payments where receipt_id=r.id order by id loop
      v_amount=public.accounting_allocation_net(p.id);
      if v_amount>0 then perform public.accounting_release(p_actor,p.id,v_amount,public.tuition_today(),'Release reversed receipt '||r.number,'receipt-release:'||v_id||':'||p.id); end if;
    end loop;
    v_journal=public.accounting_reverse(p_actor,r.journal_id,v_id,public.tuition_today(),v_reason);
    update public.accounting_receipts set reversed_at=now(),reversal_journal_id=v_journal where id=r.id;
    update public.tuition_messages set state='cancelled',cancelled_at=now(),cancelled_by=p_actor,cancellation_reason='Receipt reversed: '||v_reason
      where state in ('pending','failed') and (payload->>'receiptId'=r.id::text or (kind='account_receipt' and payload->>'documentId'=r.id::text));
    v_app=r.application_id; v_result=jsonb_build_object('journalId',v_journal);
  elsif p_action='reverse_refund' then
    select * into f from public.accounting_refunds where id=(p_data->>'refundId')::uuid for update;
    if f.id is null or f.reversed_at is not null then raise exception 'Choose an unreversed refund.'; end if;
    v_journal=public.accounting_reverse(p_actor,f.journal_id,v_id,public.tuition_today(),v_reason);
    update public.accounting_refunds set reversed_at=now(),reversal_journal_id=v_journal where id=f.id;
    update public.tuition_messages set state='cancelled',cancelled_at=now(),cancelled_by=p_actor,cancellation_reason='Refund record reversed: '||v_reason where kind='refund' and payload->>'documentId'=f.id::text and state in ('pending','failed');
    select application_id into v_app from public.accounting_receipts where id=f.receipt_id;
    v_result=jsonb_build_object('journalId',v_journal);
  elsif p_action='bill' then
    v_amount=(p_data->>'amountCents')::bigint; v_date=(p_data->>'issuedOn')::date; v_to=(p_data->>'dueOn')::date; v_category=p_data->>'category';
    if v_amount is null or v_amount<=0 or v_amount>2000000000 or v_date is null or v_to is null or v_to<v_date or length(trim(coalesce(p_data->>'description','')))<5 or not exists(select 1 from public.accounting_accounts where code=v_category and kind='expense' and active and not control_account) then raise exception 'Supply an expense category, positive amount, description, bill date and due date.'; end if;
    v_supplier=nullif(p_data->>'supplierId','')::uuid;
    if v_supplier is null then
      if length(trim(coalesce(p_data->>'supplierName',''))) not between 1 and 200 then raise exception 'Supply the supplier or payee name.'; end if;
      insert into public.accounting_suppliers(name) values(trim(p_data->>'supplierName')) returning id into v_supplier;
    end if;
    if not exists(select 1 from public.accounting_suppliers where id=v_supplier) then raise exception 'Supplier not found.'; end if;
    v_number=public.accounting_next_number('EXP',v_date);
    v_journal=public.accounting_post(p_actor,'bill:'||v_id,v_date,'Supplier bill '||v_number,'bill',v_id,jsonb_build_array(jsonb_build_object('account',v_category,'cents',v_amount),jsonb_build_object('account','2200','cents',-v_amount)));
    insert into public.accounting_bills(id,number,supplier_id,supplier_name,category,description,issued_on,due_on,amount_cents,actor_id,journal_id)
      values(v_id,v_number,v_supplier,(select name from public.accounting_suppliers where id=v_supplier),v_category,trim(p_data->>'description'),v_date,v_to,v_amount,p_actor,v_journal);
    v_result=jsonb_build_object('billId',v_id,'number',v_number);
    if coalesce((p_data->>'payNow')::boolean,false) then
      v_target=public.accounting_pay_bill(p_actor,p_data||jsonb_build_object('id',gen_random_uuid(),'billId',v_id,'note',coalesce(nullif(v_reason,''),'Verified supplier payment')));
      v_result=v_result||jsonb_build_object('billPaymentId',v_target);
    end if;
  elsif p_action='pay_bill' then
    v_target=public.accounting_pay_bill(p_actor,p_data||jsonb_build_object('id',v_id));
    v_result=jsonb_build_object('billPaymentId',v_target);
  elsif p_action='reverse_bill_payment' then
    select * into bp from public.accounting_bill_payments where id=(p_data->>'paymentId')::uuid for update;
    if bp.id is null or bp.reversed_at is not null then raise exception 'Choose an unreversed supplier payment.'; end if;
    v_journal=public.accounting_reverse(p_actor,bp.journal_id,v_id,public.tuition_today(),v_reason);
    update public.accounting_bill_payments set reversed_at=now(),reversal_journal_id=v_journal where id=bp.id;
    v_result=jsonb_build_object('journalId',v_journal);
  elsif p_action='reverse_bill' then
    select * into b from public.accounting_bills where id=(p_data->>'billId')::uuid for update;
    if b.id is null or b.reversed_at is not null then raise exception 'Choose an unreversed supplier bill.'; end if;
    if exists(select 1 from public.accounting_bill_payments where bill_id=b.id and reversed_at is null) then raise exception 'Reverse supplier payments before reversing the bill.'; end if;
    v_journal=public.accounting_reverse(p_actor,b.journal_id,v_id,public.tuition_today(),v_reason);
    update public.accounting_bills set reversed_at=now(),reversal_journal_id=v_journal where id=b.id;
    v_result=jsonb_build_object('journalId',v_journal);
  elsif p_action in ('cash_deposit','cash_withdrawal','journal') then
    v_date=(p_data->>'postedOn')::date;
    if p_action in ('cash_deposit','cash_withdrawal') then
      v_amount=(p_data->>'amountCents')::bigint;
      if v_amount is null or v_amount<=0 or length(v_reason)<5 then raise exception 'Supply the cash deposit amount, date and bank reference in the reason.'; end if;
      x=jsonb_build_array(jsonb_build_object('account',case when p_action='cash_deposit' then '1000' else '1010' end,'cents',v_amount),jsonb_build_object('account',case when p_action='cash_deposit' then '1010' else '1000' end,'cents',-v_amount));
    else
      perform public.accounting_assert(p_actor,true);
      x=p_data->'lines';
      if jsonb_typeof(x)<>'array' then raise exception 'Supply journal lines.'; end if;
      if exists(select 1 from jsonb_array_elements(x) q join public.accounting_accounts a on a.code=q->>'account' where a.control_account) then raise exception 'Use tuition, credit, receipt or bill operations for control accounts.'; end if;
    end if;
    v_journal=public.accounting_post(p_actor,p_action||':'||v_id,v_date,v_reason,case when p_action='journal' then 'manual' else 'transfer' end,v_id,x);
    v_result=jsonb_build_object('journalId',v_journal);
  elsif p_action='reverse_journal' then
    perform public.accounting_assert(p_actor,true);
    if not exists(select 1 from public.accounting_journals where id=(p_data->>'journalId')::uuid and source_kind in ('manual','transfer')) then raise exception 'Use the original receipt, refund or expense to correct this entry.'; end if;
    v_journal=public.accounting_reverse(p_actor,(p_data->>'journalId')::uuid,v_id,public.tuition_today(),v_reason);
    v_result=jsonb_build_object('journalId',v_journal);
  elsif p_action='bank_import' then
    v_from=(p_data->>'fromDate')::date; v_to=(p_data->>'toDate')::date;
    if v_from is null or v_to is null or v_from>v_to or v_to>public.tuition_today() or (s.closed_through is not null and v_from<=s.closed_through) then raise exception 'Choose an open statement date range ending today or earlier.'; end if;
    if jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows') not between 0 and 500 then raise exception 'Import up to 500 statement rows.'; end if;
    if exists(select 1 from public.accounting_statement_batches where fingerprint=p_data->>'fingerprint' and voided_at is null) then raise exception 'This statement file has already been imported.'; end if;
    select coalesce(sum((q->>'amountCents')::bigint),0) into v_amount from jsonb_array_elements(p_data->'rows') q;
    if (p_data->>'openingCents')::bigint+v_amount<>(p_data->>'closingCents')::bigint then raise exception 'Statement opening balance plus transactions must equal its closing balance.'; end if;
    insert into public.accounting_statement_batches(id,fingerprint,name,account_code,from_date,to_date,opening_cents,closing_cents,actor_id)
      values(v_id,p_data->>'fingerprint',left(coalesce(p_data->>'name','Bank statement'),200),'1000',v_from,v_to,(p_data->>'openingCents')::bigint,(p_data->>'closingCents')::bigint,p_actor);
    for x in select value from jsonb_array_elements(p_data->'rows') loop
      if (x->>'postedOn')::date not between v_from and v_to or (x->>'amountCents')::bigint=0 or length(trim(coalesce(x->>'externalId',''))) not between 1 and 150 then raise exception 'Every statement row needs a unique transaction ID, in-range date and nonzero signed amount.'; end if;
      if exists(select 1 from public.accounting_statement_lines where external_id=x->>'externalId' and not voided) then raise exception 'A bank transaction ID in this file was already imported. Remove overlapping rows or use the original import.'; end if;
      insert into public.accounting_statement_lines(batch_id,external_id,posted_on,description,amount_cents) values(v_id,x->>'externalId',(x->>'postedOn')::date,left(coalesce(x->>'description',''),500),(x->>'amountCents')::bigint);
    end loop;
    v_result=jsonb_build_object('batchId',v_id,'rows',jsonb_array_length(p_data->'rows'));
  elsif p_action='bank_void_import' then
    v_target=(p_data->>'batchId')::uuid;
    if length(v_reason)<5 or not exists(select 1 from public.accounting_statement_batches where id=v_target and voided_at is null and (s.closed_through is null or from_date>s.closed_through)) then raise exception 'Choose an open-period statement import and give a reason. Reopen closed periods first.'; end if;
    if exists(select 1 from public.accounting_statement_lines where batch_id=v_target and matched_journal_id is not null) then raise exception 'Unmatch its transactions before voiding this statement import.'; end if;
    update public.accounting_statement_lines set voided=true where batch_id=v_target;
    update public.accounting_statement_batches set voided_at=now(),void_reason=v_reason where id=v_target;
  elsif p_action in ('bank_match','bank_unmatch') then
    perform public.accounting_match(p_actor,(p_data->>'lineId')::uuid,nullif(p_data->>'journalId','')::uuid,v_reason,p_action='bank_unmatch');
  elsif p_action in ('bank_timing','bank_timing_remove') then
    v_target=(p_data->>'journalId')::uuid;
    select posted_on into v_date from public.accounting_journals where id=v_target and reversal_of is null;
    if v_date is null or (s.closed_through is not null and v_date<=s.closed_through) or length(v_reason)<5 then raise exception 'Choose an open-period bank entry and record the timing reason. Reopen a closed period first.'; end if;
    if p_action='bank_timing' then
      v_to=(p_data->>'expectedOn')::date;
      if v_to is null or v_to<=v_date or not exists(select 1 from public.accounting_lines where journal_id=v_target and account_code='1000') or exists(select 1 from public.accounting_journals where reversal_of=v_target) or exists(select 1 from public.accounting_statement_lines where matched_journal_id=v_target) then raise exception 'Choose an unmatched bank entry and an expected bank-clearing date after its posting date.'; end if;
      insert into public.accounting_bank_timing(journal_id,expected_on,reason,actor_id) values(v_target,v_to,v_reason,p_actor)
        on conflict(journal_id) do update set expected_on=excluded.expected_on,reason=excluded.reason,actor_id=p_actor,withdrawn_at=null,withdrawal_reason=null;
    else
      update public.accounting_bank_timing set withdrawn_at=now(),withdrawal_reason=v_reason where journal_id=v_target;
    end if;
  elsif p_action='recognise' then
    v_count=public.accounting_recognise(p_actor,(p_data->>'throughDate')::date);
    v_result=jsonb_build_object('invoicesUpdated',v_count);
  elsif p_action in ('withdraw','suspend','reactivate','arrangement') then
    select * into a from public.applications where id=(p_data->>'applicationId')::uuid for update;
    v_app=a.id;
    if a.id is null or length(v_reason)<5 then raise exception 'Choose a learner and record a reason of at least five characters.'; end if;
    if p_action='arrangement' then
      v_date=nullif(p_data->>'untilDate','')::date;
      if v_date is not null and v_date<public.tuition_today() then raise exception 'An arrangement must end today or in the future.'; end if;
      update public.applications set arrangement_until=v_date,arrangement_note=v_reason where id=a.id;
    elsif p_action='withdraw' then
      if a.status not in ('active','pending_payment') or a.enrollment_state='withdrawn' then raise exception 'Withdraw an enrolled learner or an approved application awaiting payment.'; end if;
      v_date=(p_data->>'noticeDate')::date;
      if v_date is null or v_date>public.tuition_today() then raise exception 'Record the actual withdrawal notice date.'; end if;
      v_to=nullif(p_data->>'endDate','')::date;
      if extract(day from v_date)<=20 and v_to is null then v_to=(date_trunc('month',v_date)+interval '1 month - 1 day')::date; end if;
      if v_to is null or v_to<v_date then raise exception 'For late notice, record the agreed final billing date on or after notice.'; end if;
      if coalesce((p_data->>'noticeConfirmed')::boolean,false) is not true then raise exception 'Confirm the final date and charges were discussed with the family.'; end if;
      update public.applications set enrollment_state='withdrawn',withdrawn_on=v_date,billing_end_date=v_to,lifecycle_reason=v_reason,status=case when status='pending_payment' then 'archived'::public.application_status else status end where id=a.id;
    elsif p_action='suspend' then
      if a.status<>'active' or a.enrollment_state<>'active' then raise exception 'Suspend only an activated learner.'; end if;
      if coalesce((p_data->>'noticeConfirmed')::boolean,false) is not true then raise exception 'Confirm the family has received notice before suspension.'; end if;
      if p_data->>'cause'='unpaid' and (extract(day from public.tuition_today())<10 or coalesce(a.arrangement_until,'-infinity'::date)>=public.tuition_today() or not exists(select 1 from public.tuition_invoices where application_id=a.id and due_date<public.tuition_today() and public.accounting_invoice_balance(id)>0)) then raise exception 'Unpaid-tuition suspension starts from the 10th, requires an overdue balance and respects current arrangements.'; end if;
      update public.applications set enrollment_state='suspended',lifecycle_reason=v_reason where id=a.id;
    else
      if a.enrollment_state not in ('suspended','withdrawn') then raise exception 'Reactivate only a suspended or withdrawn learner.'; end if;
      v_date=(p_data->>'startDate')::date;
      if v_date is null or v_date<public.tuition_today() or extract(month from v_date) not between 2 and 11 or not exists(select 1 from public.tuition_programmes where grade=a.grade_level and extract(isodow from v_date)::integer=any(weekdays)) or exists(select 1 from public.tuition_closures where day=v_date) then raise exception 'Choose today or a future scheduled teaching day in February to November.'; end if;
      if coalesce(a.arrangement_until,'-infinity'::date)<public.tuition_today() and exists(select 1 from public.tuition_invoices where application_id=a.id and due_date<public.tuition_today() and public.accounting_invoice_balance(id)>0) then raise exception 'Settle overdue tuition or record a current payment arrangement before reactivation.'; end if;
      update public.applications set billing_end_date=null where id=a.id;
      v_target=public.admin_create_invoice(p_actor,a.id,date_trunc('month',v_date)::date,v_date);
      select * into i from public.tuition_invoices where id=v_target;
      if i.amount_cents<=i.credited_cents then raise exception 'The return-month invoice was fully credited. Choose a later billing month or review the agreed charges before reactivation.'; end if;
      if public.accounting_invoice_paid(i.id)<i.amount_cents-i.credited_cents then
        v_result=jsonb_build_object('pendingPayment',true,'invoiceId',i.id);
      else
        update public.applications set status='active',enrollment_state='active',withdrawn_on=null,tuition_start_date=v_date,lifecycle_reason=v_reason,activation_invoice_id=i.id where id=a.id;
        v_result=jsonb_build_object('reactivated',true,'invoiceId',i.id);
      end if;
    end if;
  elsif p_action='account' then
    perform public.accounting_assert(p_actor,true);
    if p_data->>'code' !~ '^[0-9]{4}$' or length(trim(coalesce(p_data->>'name','')))<2 or p_data->>'kind' not in ('asset','liability','equity','income','expense') then raise exception 'Supply a four-digit account code, name and account type.'; end if;
    insert into public.accounting_accounts(code,name,kind) values(p_data->>'code',trim(p_data->>'name'),p_data->>'kind');
  elsif p_action='role' then
    perform public.accounting_assert(p_actor,true);
    v_target=(p_data->>'userId')::uuid;
    if not exists(select 1 from public.admin_users where user_id=v_target and enabled) or p_data->>'role' not in ('owner','bookkeeper','viewer') then raise exception 'Choose an enabled administrator and valid finance role.'; end if;
    if exists(select 1 from public.admin_users where user_id=v_target and finance_role='owner') and p_data->>'role'<>'owner' and (select count(*) from public.admin_users where enabled and finance_role='owner')<=1 then raise exception 'Keep at least one enabled finance owner.'; end if;
    update public.admin_users set finance_role=p_data->>'role' where user_id=v_target;
  elsif p_action='settings' then
    perform public.accounting_assert(p_actor,true);
    v_date=(p_data->>'booksStart')::date;
    if v_date is null or v_date>public.tuition_today() then raise exception 'The books start date must be today or earlier.'; end if;
    if v_date<>s.books_start and exists(select 1 from public.accounting_journals) then raise exception 'The books start date is fixed after posting begins.'; end if;
    update public.accounting_settings set books_start=v_date,automation_enabled=coalesce((p_data->>'automationEnabled')::boolean,false),auto_send=coalesce((p_data->>'autoSend')::boolean,false),scheduler_actor=p_actor where singleton;
  elsif p_action='close_period' then
    perform public.accounting_assert(p_actor,true);
    v_date=(p_data->>'throughDate')::date;
    if v_date is null or v_date>=public.tuition_today() or v_date<>(date_trunc('month',v_date)+interval '1 month - 1 day')::date or v_date<s.books_start or v_date<=coalesce(s.closed_through,s.books_start-1) then raise exception 'Close a completed month after the current closed-through date.'; end if;
    if coalesce((p_data->>'reviewed')::boolean,false) is not true or length(v_reason)<5 then raise exception 'Confirm the reports and reconciliation were reviewed, and record a closing note.'; end if;
    perform public.accounting_recognise(p_actor,v_date);
    if exists(select 1 from jsonb_each_text(public.accounting_integrity()) q where q.value::numeric<>0) then raise exception 'The ledger and its tuition/expense records must reconcile before closing.'; end if;
    if exists(select 1 from public.accounting_statement_lines where posted_on<=v_date and matched_journal_id is null and not voided) then raise exception 'Match imported bank transactions before closing the period.'; end if;
    select coalesce(sum(l.amount_cents),0) into v_cash from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id where l.account_code='1010' and j.posted_on<=v_date;
    if nullif(p_data->>'countedCashCents','')::bigint is distinct from v_cash then raise exception 'The counted cash must agree with cash on hand before closing.'; end if;
    select coalesce(sum(l.amount_cents),0) into v_bank from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id where l.account_code='1000' and j.posted_on<=v_date;
    if exists(select 1 from public.accounting_journals j where j.posted_on<=v_date and j.reversal_of is null and not exists(select 1 from public.accounting_journals where reversal_of=j.id) and (select coalesce(sum(amount_cents),0) from public.accounting_lines where journal_id=j.id and account_code='1000')<>0 and not exists(select 1 from public.accounting_statement_lines where matched_journal_id=j.id and posted_on<=v_date) and not exists(select 1 from public.accounting_bank_timing where journal_id=j.id and withdrawn_at is null and expected_on>v_date)) then raise exception 'Reconcile bank ledger entries or record verified clearing-date differences before closing.'; end if;
    select coalesce(sum(l.amount_cents),0) into v_timing from public.accounting_bank_timing t join public.accounting_journals j on j.id=t.journal_id join public.accounting_lines l on l.journal_id=j.id and l.account_code='1000' where t.withdrawn_at is null and t.expected_on>v_date and j.posted_on<=v_date and not exists(select 1 from public.accounting_journals where reversal_of=j.id) and not exists(select 1 from public.accounting_statement_lines where matched_journal_id=j.id and posted_on<=v_date);
    if exists(select 1 from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id where l.account_code='1000' and j.posted_on<=v_date) and not exists(select 1 from public.accounting_statement_batches where to_date=v_date and voided_at is null and closing_cents+v_timing=v_bank) then raise exception 'Import a bank statement ending on the closing date whose balance plus verified timing differences agrees with the ledger.'; end if;
    update public.accounting_settings set closed_through=v_date where singleton;
    insert into public.accounting_period_events(action,through_date,reason,actor_id) values('close',v_date,v_reason,p_actor);
  elsif p_action='reopen_period' then
    perform public.accounting_assert(p_actor,true);
    v_date=(p_data->>'fromDate')::date;
    if v_date is null or extract(day from v_date)<>1 or v_date<s.books_start or s.closed_through is null or v_date>s.closed_through or length(v_reason)<5 then raise exception 'Choose a closed month to reopen and give a reason.'; end if;
    update public.accounting_settings set closed_through=v_date-1 where singleton;
    insert into public.accounting_period_events(action,through_date,reason,actor_id) values('reopen',v_date-1,v_reason,p_actor);
  else raise exception 'Unknown accounting action.';
  end if;
  perform public.accounting_audit(p_actor,p_action,(p_data-'rows'-'lines')||v_result,v_app);
  insert into public.accounting_requests(id,action,payload,result,actor_id) values(v_request,p_action,p_data,v_result,p_actor);
  return v_result;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'accounting_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
grant execute on function public.accounting_mutate(uuid,text,jsonb) to service_role;


-- Connect the existing admin workflow to the accounting domain.
create or replace function public.admin_mutate(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a public.applications; i public.tuition_invoices; pay public.tuition_payments;
  v_app uuid; v_invoice uuid; v_id uuid; v_start date; v_month date;
  v_today date=public.tuition_today();
  v_paid bigint; v_amount integer; v_note text=trim(coalesce(p_data->>'note',''));
  v_method text; v_ref text; v_count integer=0; v_existing public.tuition_payments; v_days smallint[];
begin
  perform public.accounting_assert(p_actor);
  perform 1 from public.accounting_settings where singleton for update;
  if length(v_note)>2000 then raise exception 'Notes must be at most 2000 characters.'; end if;
  if p_action='generate_month' then
    v_month=(p_data->>'month')::date;
    if v_month is null or extract(day from v_month)<>1 or v_month<>date_trunc('month',v_today+interval '1 month')::date or extract(day from v_today)<25 then
      raise exception 'Generate next month invoices on or after the 25th.';
    end if;
    if extract(month from v_month) not between 2 and 11 then
      perform public.accounting_audit(p_actor,'generate_month',jsonb_build_object('month',v_month,'seasonalSkip',true,'count',0));
      return jsonb_build_object('count',0,'seasonalSkip',true);
    end if;
    for a in select * from public.applications where status='active' and (enrollment_state='active' or (enrollment_state='withdrawn' and billing_end_date>=v_month)) and tuition_start_date<=v_month and (billing_end_date is null or billing_end_date>=v_month) order by id for update loop
      if not exists(select 1 from public.tuition_invoices where application_id=a.id and billing_month=v_month) then
        perform public.admin_create_invoice(p_actor,a.id,v_month,v_month); v_count=v_count+1;
      end if;
    end loop;
  elsif p_action='queue_reminders' then
    if extract(day from v_today)<3 then raise exception 'Unpaid-balance reminders start on the 3rd.'; end if;
    for i in select t.* from public.tuition_invoices t join public.applications app on app.id=t.application_id where t.due_date<=v_today and coalesce(app.arrangement_until,'-infinity'::date)<v_today order by t.id for update of t loop
      v_paid=public.accounting_invoice_paid(i.id)+i.credited_cents;
      if v_paid<i.amount_cents then
        perform public.admin_queue(i.id,'reminder','reminder:'||i.id||':'||date_trunc('month',v_today)::date); v_count=v_count+1;
      end if;
    end loop;
  elsif p_action='payment' then
    select * into i from public.tuition_invoices where id=(p_data->>'invoiceId')::uuid for update;
    if i.id is null then raise exception 'Invoice not found.'; end if;
    v_app=i.application_id;
    perform public.accounting_receive(p_actor,jsonb_build_object('id',p_data->>'paymentId','applicationId',i.application_id,'amountCents',p_data->'amountCents','paidOn',p_data->>'paidOn','method',p_data->>'method','reference',p_data->>'reference','note',p_data->>'note','allocations',jsonb_build_array(jsonb_build_object('invoiceId',i.id,'amountCents',p_data->'amountCents'))),true);
  else
    v_app=(p_data->>'applicationId')::uuid;
    select * into a from public.applications where id=v_app for update;
    if a.id is null then raise exception 'Application not found.'; end if;
    if p_action='approve' then
      if a.status<>'pending_review' then raise exception 'Only applications pending review can be approved.'; end if;
      v_start=(p_data->>'startDate')::date;
      if v_start is null or v_start<v_today then raise exception 'Choose today or a future start date.'; end if;
      select weekdays into v_days from public.tuition_programmes where grade=a.grade_level;
      if v_days is null then raise exception 'A billing programme must be configured for this grade.'; end if;
      if not (extract(isodow from v_start)::integer=any(v_days)) or exists(select 1 from public.tuition_closures where day=v_start) then raise exception 'Choose a scheduled programme day that is not a closure.'; end if;
      if not exists(select 1 from public.learner_documents where application_id=a.id) then raise exception 'A finalized report card is required before approval.'; end if;
      update public.applications set status='pending_payment',tuition_start_date=v_start,reviewed_at=now(),reviewed_by=p_actor where id=a.id;
      v_invoice=public.admin_create_invoice(p_actor,a.id,date_trunc('month',v_start)::date,v_start);
      update public.applications set activation_invoice_id=v_invoice where id=a.id;
    elsif p_action='reject' then
      if a.status<>'pending_review' or length(v_note)<5 then raise exception 'Reject only a pending review application and give a reason of at least five characters.'; end if;
      update public.applications set status='rejected',reviewed_at=now(),reviewed_by=p_actor where id=a.id;
    elsif p_action='note' then
      if length(v_note)=0 then raise exception 'A note is required.'; end if;
    elsif p_action='activate' then
      if a.status<>'pending_payment' or a.reviewed_by is null then raise exception 'Approval and first payment are required before activation.'; end if;
      select * into i from public.tuition_invoices where id=a.activation_invoice_id for update;
      v_paid=public.accounting_invoice_paid(i.id)+i.credited_cents;
      if i.id is null or i.amount_cents<=i.credited_cents or v_paid<i.amount_cents then raise exception 'The first invoice must be fully paid before activation.'; end if;
      update public.applications set status='active',enrollment_state='active',activated_at=now(),payment_status='first_invoice_paid' where id=a.id;
      perform public.admin_queue(i.id,'activation','activation:'||a.id);
    else raise exception 'Unknown action.'; end if;
  end if;
  insert into public.admin_audit(actor_id,action,application_id,details)
    values(p_actor,p_action,v_app,p_data-'action');
  return jsonb_build_object('invoiceId',v_invoice,'count',v_count);
end $$;


create or replace function public.admin_snapshot(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.admin_assert(p_actor);
  return jsonb_build_object(
    'finance_role',(select finance_role from public.admin_users where user_id=p_actor),
    'applications',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select a.*,l.student_number,to_jsonb(l) as learner,
        (select to_jsonb(g) from public.guardians g where g.application_id=a.id limit 1) as guardian,
        coalesce((select jsonb_agg(s) from public.application_subjects s where s.application_id=a.id),'[]') as subject_marks
        from public.applications a left join public.learners l on l.application_id=a.id order by a.created_at desc limit 500) x),'[]'),
    'invoices',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select i.*,public.accounting_invoice_paid(i.id) paid_cents
      from public.tuition_invoices i order by i.created_at desc limit 1000) x),'[]'),
    'payments',coalesce((select jsonb_agg(x) from (select p.*,public.accounting_allocation_net(p.id) as net_cents,r.reversed_at as receipt_reversed_at from public.tuition_payments p left join public.accounting_receipts r on r.id=p.receipt_id order by p.created_at desc limit 1000)x),'[]'),
    'audit',coalesce((select jsonb_agg(x) from(select a.*,u.email as actor_email from public.admin_audit a left join auth.users u on u.id=a.actor_id order by a.created_at desc,a.id desc limit 200)x),'[]'),
    'messages',coalesce((select jsonb_agg(x) from(select id,invoice_id,kind,state,attempts,last_error,created_at,sent_at,first_attempt_at,claimed_at,payload,cancelled_at,cancelled_by,cancellation_reason from public.tuition_messages order by case when state in ('pending','sending','failed') then 0 else 1 end,created_at desc,id desc limit 200)x),'[]'),
    'messages_truncated',(select count(*)>200 from public.tuition_messages),
    'programmes',coalesce((select jsonb_agg(p order by grade) from public.tuition_programmes p),'[]'),
    'closures',coalesce((select jsonb_agg(c order by day) from public.tuition_closures c),'[]'),
    'truncated', (select count(*)>=500 from public.applications) or (select count(*)>=1000 from public.tuition_invoices) or (select count(*)>=1000 from public.tuition_payments),
    'today',public.tuition_today()
  );
end $$;


create or replace function public.admin_claim_message(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.tuition_messages; v_balance bigint;
begin
  perform public.accounting_assert(p_actor);
  select * into m from public.tuition_messages where id=p_id for update;
  if m.id is null or m.state in ('sent','cancelled') then return null; end if;
  if m.state='sending' and m.claimed_at>now()-interval '2 minutes' then raise exception 'This message is already being sent.'; end if;
  -- Provider idempotency keys are not permanent. Require investigation of ambiguous old sends.
  if m.first_attempt_at is not null and m.first_attempt_at<now()-interval '23 hours' then raise exception 'Old delivery attempt requires provider-history review before retry.'; end if;
  select public.accounting_invoice_balance(i.id) into v_balance from public.tuition_invoices i where i.id=m.invoice_id;
  if m.kind='reminder' and exists(select 1 from public.tuition_invoices i join public.applications a on a.id=i.application_id where i.id=m.invoice_id and a.arrangement_until>=public.tuition_today()) then
    update public.tuition_messages set state='sent',sent_at=now(),last_error='Skipped: current payment arrangement' where id=m.id;
    return null;
  end if;
  if m.kind in ('invoice','reminder') and v_balance<=0 then
    update public.tuition_messages set state='sent',sent_at=now(),last_error='Skipped: invoice settled' where id=m.id;
    return null;
  end if;
  update public.tuition_messages set state='sending',first_attempt_at=coalesce(first_attempt_at,now()),claimed_at=now(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=m.id returning * into m;
  insert into public.admin_audit(actor_id,action,application_id,details) values(p_actor,'send_message',coalesce((select application_id from public.tuition_invoices where id=m.invoice_id),nullif(m.payload->>'applicationId','')::uuid),jsonb_build_object('messageId',m.id,'kind',m.kind));
  return to_jsonb(m);
end $$;


create or replace function public.admin_cancel_message(
  p_actor uuid,p_id uuid,p_reason text,p_provider_reviewed boolean default false
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.tuition_messages; v_application uuid; v_reason text=trim(coalesce(p_reason,''));
begin
  perform public.accounting_assert(p_actor);
  select * into m from public.tuition_messages where id=p_id for update;
  if m.id is null then raise exception 'Notification not found.'; end if;
  if m.state='cancelled' then return jsonb_build_object('id',m.id,'alreadyCancelled',true); end if;
  if m.state='sent' then raise exception 'A completed notification cannot be cancelled or recalled.'; end if;
  if m.state='sending' and (m.claimed_at is null or m.claimed_at>now()-interval '2 minutes') then
    raise exception 'This notification is being sent. Refresh after the current attempt finishes.';
  end if;
  if length(v_reason)<5 or length(v_reason)>500 then raise exception 'Give a cancellation reason of 5 to 500 characters.'; end if;
  if m.attempts>0 and p_provider_reviewed is distinct from true then
    raise exception 'Check the email provider history before cancelling a previously attempted notification. Cancellation cannot recall an email.';
  end if;
  update public.tuition_messages set state='cancelled',cancelled_at=now(),cancelled_by=p_actor,cancellation_reason=v_reason where id=m.id;
  select application_id into v_application from public.tuition_invoices where id=m.invoice_id;
  insert into public.admin_audit(actor_id,action,application_id,details)
    values(p_actor,'cancel_message',v_application,jsonb_build_object('messageId',m.id,'invoiceId',m.invoice_id,'kind',m.kind,'reason',v_reason,'previousState',m.state,'attempts',m.attempts,'providerHistoryReviewed',coalesce(p_provider_reviewed,false)));
  return jsonb_build_object('id',m.id,'cancelled',true);
end $$;
revoke all on function public.admin_cancel_message(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_cancel_message(uuid,uuid,text,boolean) to service_role;


create or replace function public.accounting_balance(p_account text,p_through date) returns bigint
language sql stable security definer set search_path='' as $$
  select coalesce(sum(l.amount_cents),0)::bigint from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id where l.account_code=p_account and j.posted_on<=p_through;
$$;
create or replace function public.accounting_integrity() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'receivableDifference',public.accounting_balance('1100',public.tuition_today())-coalesce((select sum(public.accounting_invoice_balance(id)) from public.tuition_invoices),0),
    'creditDifference',-public.accounting_balance('2100',public.tuition_today())-coalesce((select sum(public.accounting_receipt_available(id)) from public.accounting_receipts),0),
    'deferredDifference',-public.accounting_balance('2000',public.tuition_today())-coalesce((select sum(amount_cents-credited_cents-recognised_cents) from public.tuition_invoices),0),
    'payableDifference',-public.accounting_balance('2200',public.tuition_today())-coalesce((select sum(b.amount_cents-coalesce((select sum(amount_cents) from public.accounting_bill_payments where bill_id=b.id and reversed_at is null),0)) from public.accounting_bills b where b.reversed_at is null),0),
    'trialBalance',coalesce((select sum(amount_cents) from public.accounting_lines),0)
  );
$$;
create or replace function public.accounting_snapshot(p_actor uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_asof date=least(p_to,public.tuition_today()); v_accounts jsonb; v_income bigint; v_expenses bigint; v_assets bigint; v_liabilities bigint; v_equity bigint; v_accumulated bigint; v_cash_in bigint; v_cash_out bigint;
begin
  perform public.admin_assert(p_actor);
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'Choose a report range of up to ten years.'; end if;
  select jsonb_agg(q order by code) into v_accounts from (
    select a.*,public.accounting_balance(a.code,v_asof) as balance_cents,
      coalesce(sum(l.amount_cents) filter(where j.posted_on between p_from and v_asof),0)::bigint as period_net_cents,
      coalesce(sum(l.amount_cents) filter(where l.amount_cents>0 and j.posted_on<=v_asof),0)::bigint as debit_cents,
      -coalesce(sum(l.amount_cents) filter(where l.amount_cents<0 and j.posted_on<=v_asof),0)::bigint as credit_cents
    from public.accounting_accounts a left join public.accounting_lines l on l.account_code=a.code left join public.accounting_journals j on j.id=l.journal_id group by a.code
  ) q;
  select -coalesce(sum((x->>'period_net_cents')::bigint) filter(where x->>'kind'='income'),0),coalesce(sum((x->>'period_net_cents')::bigint) filter(where x->>'kind'='expense'),0),
    coalesce(sum((x->>'balance_cents')::bigint) filter(where x->>'kind'='asset'),0),-coalesce(sum((x->>'balance_cents')::bigint) filter(where x->>'kind'='liability'),0),
    -coalesce(sum((x->>'balance_cents')::bigint) filter(where x->>'kind'='equity'),0),-coalesce(sum((x->>'balance_cents')::bigint) filter(where x->>'kind' in ('income','expense')),0)
    into v_income,v_expenses,v_assets,v_liabilities,v_equity,v_accumulated from jsonb_array_elements(v_accounts) x;
  select coalesce(sum(greatest(movement,0)),0),-coalesce(sum(least(movement,0)),0) into v_cash_in,v_cash_out from (
    select sum(l.amount_cents) as movement from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id where l.account_code in ('1000','1010') and j.posted_on between p_from and v_asof group by j.id
  ) q;
  return jsonb_build_object(
    'today',public.tuition_today(),'fromDate',p_from,'toDate',p_to,'asOf',v_asof,
    'settings',(select to_jsonb(s) from public.accounting_settings s where singleton),
    'role',(select finance_role from public.admin_users where user_id=p_actor),
    'accounts',v_accounts,
    'reports',jsonb_build_object('incomeCents',v_income,'expenseCents',v_expenses,'profitCents',v_income-v_expenses,'assetsCents',v_assets,'liabilitiesCents',v_liabilities,'equityCents',v_equity,'accumulatedResultCents',v_accumulated,'balanceSheetDifference',v_assets-v_liabilities-v_equity-v_accumulated,
      'bankCents',public.accounting_balance('1000',v_asof),'cashCents',public.accounting_balance('1010',v_asof),
      'cashOpeningCents',public.accounting_balance('1000',p_from-1)+public.accounting_balance('1010',p_from-1),'cashInCents',v_cash_in,'cashOutCents',v_cash_out),
    'integrity',public.accounting_integrity(),
    'families',coalesce((select jsonb_agg(q) from (
      select family.*,
        coalesce((select sum(public.accounting_invoice_balance(i.id)) from public.tuition_invoices i join public.applications a2 on a2.id=i.application_id where lower(trim(a2.guardian_email))=family.email),0) as owed_cents,
        coalesce((select sum(public.accounting_receipt_available(r.id)) from public.accounting_receipts r where r.billing_email=family.email),0) as credit_cents
      from (select lower(trim(a.guardian_email)) as email,min(a.guardian_name) as name,string_agg(a.learner_name,', ' order by a.learner_name) as learners,(array_agg(a.id order by a.created_at))[1] as application_id from public.applications a group by lower(trim(a.guardian_email))) family order by family.name limit 500
    ) q),'[]'),
    'receipts',coalesce((select jsonb_agg(q) from (select r.*,public.accounting_receipt_available(r.id) as available_cents,
      coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'invoiceId',p.invoice_id,'invoiceNumber',i.number,'amountCents',p.amount_cents,'netCents',public.accounting_allocation_net(p.id))) from public.tuition_payments p join public.tuition_invoices i on i.id=p.invoice_id where p.receipt_id=r.id),'[]') as allocations
      from public.accounting_receipts r order by r.created_at desc limit 500) q),'[]'),
    'credit_notes',coalesce((select jsonb_agg(q) from(select c.*,i.number as invoice_number,a.learner_name from public.accounting_credit_notes c join public.tuition_invoices i on i.id=c.invoice_id join public.applications a on a.id=i.application_id order by c.created_at desc limit 500)q),'[]'),
    'refunds',coalesce((select jsonb_agg(q) from(select f.*,r.number as receipt_number,r.payer_name from public.accounting_refunds f join public.accounting_receipts r on r.id=f.receipt_id order by f.created_at desc limit 500)q),'[]'),
    'suppliers',coalesce((select jsonb_agg(q) from(select * from public.accounting_suppliers order by name limit 500)q),'[]'),
    'bills',coalesce((select jsonb_agg(q) from(select b.*,coalesce((select sum(amount_cents) from public.accounting_bill_payments where bill_id=b.id and reversed_at is null),0) as paid_cents,
      coalesce((select jsonb_agg(p order by p.created_at) from public.accounting_bill_payments p where p.bill_id=b.id),'[]') as payments,
      coalesce((select jsonb_agg(a order by a.created_at) from public.accounting_attachments a where a.bill_id=b.id),'[]') as attachments
      from public.accounting_bills b order by b.created_at desc limit 500)q),'[]'),
    'journals',coalesce((select jsonb_agg(q) from(select j.*,u.email as actor_email,(select id from public.accounting_journals where reversal_of=j.id) as reversed_by,
      (select id from public.accounting_statement_lines where matched_journal_id=j.id) as bank_match_id,
      coalesce((select jsonb_agg(jsonb_build_object('account',l.account_code,'name',a.name,'cents',l.amount_cents,'invoiceId',l.invoice_id,'applicationId',l.application_id) order by l.amount_cents desc,l.account_code) from public.accounting_lines l join public.accounting_accounts a on a.code=l.account_code where l.journal_id=j.id),'[]') as lines
      from public.accounting_journals j left join auth.users u on u.id=j.actor_id where j.posted_on between p_from and v_asof order by j.posted_on desc,j.created_at desc limit 200)q),'[]'),
    'bank_candidates',coalesce((select jsonb_agg(q) from(select j.id,j.posted_on,j.description,sum(l.amount_cents) as amount_cents from public.accounting_journals j join public.accounting_lines l on l.journal_id=j.id and l.account_code='1000' where j.reversal_of is null and not exists(select 1 from public.accounting_journals where reversal_of=j.id) and not exists(select 1 from public.accounting_statement_lines where matched_journal_id=j.id) group by j.id having sum(l.amount_cents)<>0 order by j.posted_on desc limit 1000)q),'[]'),
    'bank_timing',coalesce((select jsonb_agg(q) from(select t.*,j.posted_on,j.description,(select coalesce(sum(amount_cents),0) from public.accounting_lines where journal_id=j.id and account_code='1000') as amount_cents,(select posted_on from public.accounting_statement_lines where matched_journal_id=j.id) as cleared_on from public.accounting_bank_timing t join public.accounting_journals j on j.id=t.journal_id order by t.created_at desc limit 1000)q),'[]'),
    'bank_batches',coalesce((select jsonb_agg(q) from(select b.*,(select count(*) from public.accounting_statement_lines where batch_id=b.id) as row_count,(select count(*) from public.accounting_statement_lines where batch_id=b.id and matched_journal_id is null and not voided) as unmatched_count from public.accounting_statement_batches b order by b.created_at desc limit 100)q),'[]'),
    'bank_lines',coalesce((select jsonb_agg(q) from(select * from public.accounting_statement_lines where not voided order by posted_on desc,id limit 1000)q),'[]'),
    'ageing',coalesce((select jsonb_agg(q) from (
      select i.id,i.number,a.learner_name,a.guardian_email,i.due_date,sum(l.amount_cents) as balance_cents,
        case when i.due_date>=v_asof then 'Current' when v_asof-i.due_date<=30 then '1–30 days' when v_asof-i.due_date<=60 then '31–60 days' when v_asof-i.due_date<=90 then '61–90 days' else 'Over 90 days' end as bucket
      from public.tuition_invoices i join public.applications a on a.id=i.application_id join public.accounting_lines l on l.invoice_id=i.id and l.account_code='1100' join public.accounting_journals j on j.id=l.journal_id and j.posted_on<=v_asof group by i.id,a.id having sum(l.amount_cents)>0 order by i.due_date limit 1000
    )q),'[]'),
    'runs',coalesce((select jsonb_agg(q) from(select * from public.accounting_runs order by run_on desc limit 60)q),'[]'),
    'period_events',coalesce((select jsonb_agg(q) from(select * from public.accounting_period_events order by created_at desc limit 100)q),'[]'),
    'admins',case when exists(select 1 from public.admin_users where user_id=p_actor and finance_role='owner') then coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'email',u.email,'role',a.finance_role)) from public.admin_users a join auth.users u on u.id=a.user_id where a.enabled),'[]') else '[]'::jsonb end,
    'limits',jsonb_build_object('receipts',(select count(*)>500 from public.accounting_receipts),'families',(select count(distinct lower(trim(guardian_email)))>500 from public.applications),'bills',(select count(*)>500 from public.accounting_bills),'journals',(select count(*)>200 from public.accounting_journals where posted_on between p_from and v_asof),'bankLines',(select count(*)>1000 from public.accounting_statement_lines),'ageing',(select count(*)>1000 from public.tuition_invoices where public.accounting_invoice_balance(id)>0))
  );
end $$;

create or replace function public.accounting_document_data(p_actor uuid,p_kind text,p_id uuid,p_from date default null,p_to date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; a public.applications; r public.accounting_receipts; v_app uuid; v_void boolean=false; v_from date=coalesce(p_from,(select books_start from public.accounting_settings where singleton)); v_to date=least(coalesce(p_to,public.tuition_today()),public.tuition_today()); v_open bigint; v_items jsonb; v_report jsonb;
begin
  perform public.admin_assert(p_actor);
  if v_from>v_to then raise exception 'Choose a valid document date range.'; end if;
  if p_kind in ('account_receipt','credit_note','refund','allocation') then
    select payload into v_payload from public.tuition_messages where event_key=p_kind||':'||p_id;
    if v_payload is null then raise exception 'The financial document snapshot is unavailable.'; end if;
    if p_kind='account_receipt' then select * into r from public.accounting_receipts where id=p_id; v_app=r.application_id; v_void=r.reversed_at is not null;
    elsif p_kind='refund' then select r0.application_id,f.reversed_at is not null into v_app,v_void from public.accounting_refunds f join public.accounting_receipts r0 on r0.id=f.receipt_id where f.id=p_id;
    elsif p_kind='credit_note' then select i.application_id,c.reversed_at is not null into v_app,v_void from public.accounting_credit_notes c join public.tuition_invoices i on i.id=c.invoice_id where c.id=p_id;
    else select i.application_id into v_app from public.tuition_messages m join public.tuition_invoices i on i.id=m.invoice_id where m.event_key=p_kind||':'||p_id;
    end if;
    v_payload=v_payload||jsonb_build_object('voided',v_void);
  elsif p_kind='statement' then
    select * into a from public.applications where id=p_id;
    if a.id is null then raise exception 'Learner account not found.'; end if;
    v_app=a.id;
    select coalesce(sum(l.amount_cents),0) into v_open from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id join public.applications aa on aa.id=l.application_id where lower(trim(aa.guardian_email))=lower(trim(a.guardian_email)) and l.account_code in ('1100','2100') and j.posted_on<v_from;
    select coalesce(jsonb_agg(q order by q.date,q.created),'[]') into v_items from (
      select j.posted_on as date,j.created_at as created,j.description as description,sum(l.amount_cents) as cents from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id join public.applications aa on aa.id=l.application_id where lower(trim(aa.guardian_email))=lower(trim(a.guardian_email)) and l.account_code in ('1100','2100') and j.posted_on between v_from and v_to group by j.id having sum(l.amount_cents)<>0
    )q;
    v_payload=jsonb_build_object('documentKind','statement','documentId',p_id,'documentNumber','Statement-'||a.application_number,'title','Family account statement','payer',a.guardian_name,'learner',a.learner_name,'recipients',jsonb_build_array(a.guardian_email),'issuedOn',public.tuition_today(),'fromDate',v_from,'toDate',v_to,'openingCents',v_open,'items',v_items,'totalCents',v_open+coalesce((select sum((x->>'cents')::bigint) from jsonb_array_elements(v_items)x),0),'note','Positive net balance is owed to Viva; a negative balance is available family credit. This statement covers learners sharing this guardian account.');
  elsif p_kind='financial_report' then
    v_report=public.accounting_snapshot(p_actor,v_from,v_to);
    select jsonb_agg(jsonb_build_object('description',x->>'code'||' · '||(x->>'name'),'cents',(x->>'balance_cents')::bigint)) into v_items from jsonb_array_elements(v_report->'accounts')x;
    v_payload=jsonb_build_object('documentKind','financial_report','documentId',p_id,'documentNumber','Finance-'||v_from||'-'||v_to,'title','Financial report','payer','Viva Tutorials','recipients','[]'::jsonb,'issuedOn',public.tuition_today(),'fromDate',v_from,'toDate',v_to,'items',v_items,'totalCents',0,'report',v_report->'reports','note','Trial balance amounts are debit-positive and credit-negative. Report totals are calculated from the complete posted ledger. ZAR; no VAT.');
  else raise exception 'Unknown accounting document type.';
  end if;
  perform public.accounting_audit(p_actor,'accounting_document',jsonb_build_object('kind',p_kind,'documentId',p_id),v_app);
  return v_payload;
end $$;

create or replace function public.accounting_run_schedule(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_run public.accounting_runs; v_today date=public.tuition_today(); v_result jsonb='{}'; v_month date; v_recognised bigint; v_error text;
begin
  perform public.accounting_assert(p_actor,true);
  perform 1 from public.accounting_settings where singleton for update;
  select * into v_run from public.accounting_runs where run_on=v_today;
  if v_run.state='completed' then return v_run.result||jsonb_build_object('alreadyCompleted',true); end if;
  begin
    v_recognised=public.accounting_recognise(p_actor,v_today-1);
    v_result=jsonb_build_object('recognisedInvoices',v_recognised,'date',v_today);
    if extract(day from v_today)>=25 then
      v_month=date_trunc('month',v_today+interval '1 month')::date;
      v_result=v_result||jsonb_build_object('billing',public.admin_mutate(p_actor,'generate_month',jsonb_build_object('month',v_month)));
    end if;
    if extract(day from v_today)>=3 then v_result=v_result||jsonb_build_object('reminders',public.admin_mutate(p_actor,'queue_reminders','{}')); end if;
  exception when others then
    v_result=jsonb_build_object('date',v_today,'rolledBack',true);
    v_error=case when sqlstate='P0001' then left(sqlerrm,300) else 'The accounting run failed. Review server/database configuration before retrying.' end;
  end;
  insert into public.accounting_runs(run_on,state,result,last_error,actor_id) values(v_today,case when v_error is null then 'completed' else 'failed' end,v_result,v_error,p_actor)
    on conflict(run_on) do update set state=excluded.state,result=excluded.result,last_error=excluded.last_error,attempts=public.accounting_runs.attempts+1,finished_at=now();
  perform public.accounting_audit(p_actor,'accounting_run',v_result||jsonb_build_object('error',v_error));
  return v_result||jsonb_build_object('success',v_error is null,'error',v_error);
end $$;

create or replace function public.accounting_export_rows(p_actor uuid,p_kind text,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; v_asof date=least(p_to,public.tuition_today());
begin
  perform public.admin_assert(p_actor);
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Choose a valid export date range.'; end if;
  if p_kind='ledger' then
    select coalesce(jsonb_agg(q),'[]') into result from(select j.posted_on,j.description,j.id as journal_id,l.account_code,a.name,l.amount_cents from public.accounting_journals j join public.accounting_lines l on l.journal_id=j.id join public.accounting_accounts a on a.code=l.account_code where j.posted_on between p_from and v_asof order by j.posted_on,j.created_at,l.id limit 10001)q;
  elsif p_kind='ageing' then
    select coalesce(jsonb_agg(q),'[]') into result from(select i.number,a.learner_name,a.guardian_email,i.due_date,sum(l.amount_cents) as balance_cents,
      case when i.due_date>=v_asof then 'Current' when v_asof-i.due_date<=30 then '1–30 days' when v_asof-i.due_date<=60 then '31–60 days' when v_asof-i.due_date<=90 then '61–90 days' else 'Over 90 days' end as bucket
      from public.tuition_invoices i join public.applications a on a.id=i.application_id join public.accounting_lines l on l.invoice_id=i.id and l.account_code='1100' join public.accounting_journals j on j.id=l.journal_id and j.posted_on<=v_asof group by i.id,a.id having sum(l.amount_cents)>0 order by i.due_date limit 10001)q;
  else raise exception 'Choose ledger or ageing export.';
  end if;
  if jsonb_array_length(result)>10000 then raise exception 'This export exceeds 10,000 rows. Choose a smaller reporting range or earlier ageing date.'; end if;
  return result;
end $$;

-- Financial source documents retain their original fields when corrected.
create or replace function public.accounting_protect_source() returns trigger
language plpgsql set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception 'Financial source records cannot be deleted.'; end if;
  if (to_jsonb(new)-array['reversed_at','reversal_journal_id'])<>(to_jsonb(old)-array['reversed_at','reversal_journal_id']) then raise exception 'Financial source details are immutable. Record a reversal instead.'; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['accounting_receipts','accounting_refunds','accounting_credit_notes','accounting_bills','accounting_bill_payments'] loop
    execute format('drop trigger if exists accounting_immutable on public.%I',t);
    execute format('drop trigger if exists accounting_protect_source on public.%I',t);
    execute format('create trigger accounting_protect_source before update or delete on public.%I for each row execute function public.accounting_protect_source()',t);
  end loop;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'accounting_%' loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop;
end $$;
grant execute on function public.accounting_mutate(uuid,text,jsonb),public.accounting_snapshot(uuid,date,date),public.accounting_document_data(uuid,text,uuid,date,date),public.accounting_run_schedule(uuid),public.accounting_export_rows(uuid,text,date,date) to service_role;
notify pgrst,'reload schema';


create or replace function public.accounting_attachment(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.accounting_attachments; v_id uuid=(p_data->>'id')::uuid; v_size integer; v_mime text; v_meta jsonb; v_extension text;
begin
  perform public.admin_assert(p_actor);
  if p_action='prepare' then
    perform public.accounting_assert(p_actor);
    v_size=(p_data->>'size')::integer; v_mime=p_data->>'mime';
    if not exists(select 1 from public.accounting_bills where id=(p_data->>'billId')::uuid) or v_id is null or v_size is null or v_size not between 1 and 10485760 or v_mime is null or v_mime not in ('application/pdf','image/jpeg','image/png') or length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Choose a supplier bill and a PDF, JPEG or PNG document up to 10 MB.'; end if;
    select * into a from public.accounting_attachments where id=v_id;
    if a.id is null then
      v_extension=case v_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end;
      insert into public.accounting_attachments(id,bill_id,name,mime,size_bytes,storage_path,actor_id)
        values(v_id,(p_data->>'billId')::uuid,p_data->>'name',v_mime,v_size,(p_data->>'billId')||'/'||v_id||'.'||v_extension,p_actor) returning * into a;
    elsif a.bill_id<>(p_data->>'billId')::uuid or a.name<>p_data->>'name' or a.mime<>v_mime or a.size_bytes<>v_size then raise exception 'This upload request was already used for a different document.';
    end if;
  elsif p_action in ('finalize','view') then
    select * into a from public.accounting_attachments where id=v_id for update;
    if a.id is null then raise exception 'Expense document not found.'; end if;
    if p_action='finalize' then
      perform public.accounting_assert(p_actor);
      if not exists(select 1 from storage.buckets where id='accounting-documents' and not public) then raise exception 'The accounting document bucket must be private.'; end if;
      select metadata into v_meta from storage.objects where bucket_id='accounting-documents' and name=a.storage_path;
      if v_meta is null or coalesce(v_meta->>'size','') !~ '^[0-9]+$' then raise exception 'The uploaded document and its size could not be verified.'; end if;
      if (v_meta->>'size')::bigint<>a.size_bytes or lower(split_part(coalesce(v_meta->>'mimetype',''),';',1))<>a.mime then raise exception 'The uploaded document does not match the expected size and type.'; end if;
      update public.accounting_attachments set finalized_at=coalesce(finalized_at,now()) where id=a.id returning * into a;
    elsif a.finalized_at is null then raise exception 'Verify the uploaded expense document before viewing it.';
    end if;
  else raise exception 'Unknown expense document action.';
  end if;
  perform public.accounting_audit(p_actor,'expense_document',jsonb_build_object('attachmentId',a.id,'billId',a.bill_id,'operation',p_action,'fileName',a.name));
  return to_jsonb(a);
end $$;
create or replace function public.accounting_scheduler_context() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',s.automation_enabled,'autoSend',s.auto_send,'actor',s.scheduler_actor,'validActor',exists(select 1 from public.admin_users where user_id=s.scheduler_actor and enabled and finance_role='owner')) from public.accounting_settings s where singleton;
$$;
create or replace function public.accounting_write_ready(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform public.accounting_assert(p_actor);
  if not exists(select 1 from public.accounting_settings where singleton) then raise exception 'Accounting setup is incomplete.'; end if;
end $$;
create or replace function public.accounting_invoice_balance_for_admin(p_actor uuid,p_invoice uuid) returns bigint
language plpgsql stable security definer set search_path='' as $$ begin
  perform public.admin_assert(p_actor);
  return public.accounting_invoice_balance(p_invoice);
end $$;
revoke all on function public.accounting_attachment(uuid,text,jsonb),public.accounting_scheduler_context() from public,anon,authenticated;
grant execute on function public.accounting_attachment(uuid,text,jsonb),public.accounting_scheduler_context() to service_role;
revoke all on function public.accounting_invoice_balance_for_admin(uuid,uuid) from public,anon,authenticated;
grant execute on function public.accounting_invoice_balance_for_admin(uuid,uuid) to service_role;
revoke all on function public.accounting_write_ready(uuid) from public,anon,authenticated;
grant execute on function public.accounting_write_ready(uuid) to service_role;
notify pgrst,'reload schema';

-- END ACCOUNTING MIGRATIONS

-- BEGIN PARENT PORTAL MIGRATION
-- Parent access is explicitly enabled by staff for a reviewed guardian email.
-- Auth identities are bound only after Supabase verifies that email.
do $$ begin
  if to_regprocedure('public.accounting_write_ready(uuid)') is null then
    raise exception 'Apply the complete accounting setup before the parent portal migration.';
  end if;
end $$;
create index if not exists applications_parent_email on public.applications(lower(trim(guardian_email))) where reviewed_at is not null;
create table if not exists public.parent_accounts (
  email text primary key check(email=lower(trim(email)) and position('@' in email)>1),
  user_id uuid unique references auth.users(id) on delete set null,
  enabled boolean not null default false,
  granted_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  last_signed_in_at timestamptz
);
create table if not exists public.parent_auth_limits (
  key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
  kind text not null check(kind in ('send_email','send_ip','verify_email','verify_ip')),
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  attempts integer not null default 1,
  primary key(key_hash,kind)
);
create index if not exists parent_auth_limits_started on public.parent_auth_limits(started_at);
alter table public.parent_accounts enable row level security;
alter table public.parent_auth_limits enable row level security;
revoke all on public.parent_accounts,public.parent_auth_limits from public,anon,authenticated;
grant all on public.parent_accounts,public.parent_auth_limits to service_role;

create or replace function public.parent_eligible(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.applications a where lower(trim(a.guardian_email))=p_email
    and a.reviewed_at is not null and (a.status in ('active','pending_payment') or
      (a.status='archived' and exists(select 1 from public.tuition_invoices i where i.application_id=a.id))));
$$;
create or replace function public.parent_signin_allowed(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.parent_accounts where email=lower(trim(p_email)) and enabled)
    and public.parent_eligible(lower(trim(p_email)));
$$;
create or replace function public.parent_rate_limit(p_hash text,p_kind text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.parent_auth_limits; v_limit integer;
begin
  if p_kind not in ('send_email','send_ip','verify_email','verify_ip') or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid sign-in request.'; end if;
  v_limit=case p_kind when 'send_email' then 5 when 'send_ip' then 20 when 'verify_email' then 10 else 50 end;
  insert into public.parent_auth_limits(key_hash,kind,attempts) values(p_hash,p_kind,0) on conflict do nothing;
  select * into r from public.parent_auth_limits where key_hash=p_hash and kind=p_kind for update;
  if r.started_at<=now()-interval '15 minutes' then
    update public.parent_auth_limits set attempts=1,started_at=now(),last_at=now() where key_hash=p_hash and kind=p_kind; return true;
  end if;
  if r.attempts>=v_limit or (p_kind='send_email' and r.attempts>0 and r.last_at>now()-interval '60 seconds') then return false; end if;
  update public.parent_auth_limits set attempts=attempts+1,last_at=now() where key_hash=p_hash and kind=p_kind;
  delete from public.parent_auth_limits where started_at<now()-interval '2 days';
  return true;
end $$;

create or replace function public.parent_assert(p_user uuid) returns public.parent_accounts
language plpgsql stable security definer set search_path='' as $$
declare r public.parent_accounts; v_email text; v_confirmed timestamptz;
begin
  select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user;
  select * into r from public.parent_accounts where user_id=p_user and email=v_email and enabled;
  if r.email is null or v_confirmed is null or not public.parent_eligible(r.email) then raise exception 'Parent access is unavailable. Please contact Viva Tutorials.'; end if;
  return r;
end $$;
create or replace function public.parent_bind(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.parent_accounts; v_email text; v_confirmed timestamptz;
begin
  select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user;
  if v_confirmed is null then raise exception 'Verify your guardian email before signing in.'; end if;
  select * into r from public.parent_accounts where email=v_email and enabled for update;
  if r.email is null or not public.parent_eligible(v_email) or (r.user_id is not null and r.user_id<>p_user) then raise exception 'Parent access is unavailable. Please contact Viva Tutorials.'; end if;
  update public.parent_accounts set user_id=p_user,last_signed_in_at=now() where email=v_email;
  return jsonb_build_object('id',p_user,'email',v_email);
end $$;
create or replace function public.parent_scope(p_user uuid) returns setof uuid
language plpgsql stable security definer set search_path='' as $$
declare r public.parent_accounts;
begin
  r=public.parent_assert(p_user);
  return query select a.id from public.applications a where lower(trim(a.guardian_email))=r.email and a.reviewed_at is not null
    and (a.status in ('active','pending_payment') or (a.status='archived' and exists(select 1 from public.tuition_invoices i where i.application_id=a.id)));
end $$;

create or replace function public.admin_parent_access(p_actor uuid,p_application uuid,p_enabled boolean default null,p_reason text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.applications; r public.parent_accounts; v_email text;
begin
  perform public.admin_assert(p_actor);
  select * into a from public.applications where id=p_application;
  if a.id is null then raise exception 'Learner not found.'; end if;
  v_email=lower(trim(a.guardian_email));
  if p_enabled is not null then
    perform public.accounting_assert(p_actor);
    if length(trim(p_reason))<5 or length(p_reason)>2000 then raise exception 'Give a reason for changing parent access.'; end if;
    if p_enabled and (a.reviewed_at is null or a.status not in ('active','pending_payment','archived') or not public.parent_eligible(v_email)) then raise exception 'Approve the application and verify the guardian email before enabling parent access.'; end if;
    insert into public.parent_accounts(email,enabled,granted_by) values(v_email,p_enabled,p_actor)
      on conflict(email) do update set enabled=excluded.enabled,granted_by=excluded.granted_by,updated_at=now();
    perform public.accounting_audit(p_actor,case when p_enabled then 'parent_access_enabled' else 'parent_access_disabled' end,jsonb_build_object('guardianEmail',v_email,'reason',trim(p_reason),'scope','All reviewed learners using this guardian email'),a.id);
  end if;
  select * into r from public.parent_accounts where email=v_email;
  return jsonb_build_object('email',v_email,'enabled',coalesce(r.enabled,false),'registered',r.user_id is not null,'lastSignedInAt',r.last_signed_in_at,'eligible',public.parent_eligible(v_email));
end $$;

create or replace function public.parent_snapshot(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.parent_accounts; ids uuid[]; v_children jsonb; v_invoices jsonb; v_receipts jsonb; v_credits jsonb; v_refunds jsonb;
begin
  r=public.parent_assert(p_user);
  select array_agg(id) into ids from public.parent_scope(p_user) id;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.learner_name,'applicationNumber',a.application_number,'studentNumber',l.student_number,
    'grade',a.grade_level,'mode',a.tutoring_mode,'subjects',a.selected_subjects,'monthlyFeeCents',round(a.monthly_fee*100)::bigint,
    'outstandingCents',coalesce((select sum(public.accounting_invoice_balance(i0.id)) from public.tuition_invoices i0 where i0.application_id=a.id),0),'status',case when a.enrollment_state<>'not_enrolled' then a.enrollment_state else a.status::text end,'startDate',a.tuition_start_date,
    'billingEndDate',a.billing_end_date,'arrangementUntil',case when a.arrangement_until>=public.tuition_today() then a.arrangement_until end,
    'readyForActivation',exists(select 1 from public.tuition_invoices fi where fi.id=a.activation_invoice_id and fi.amount_cents>fi.credited_cents and public.accounting_invoice_balance(fi.id)=0),'school',l.school,'programme',p.label,'schedule',p.weekdays) order by a.learner_name),'[]') into v_children
    from public.applications a left join public.learners l on l.application_id=a.id left join public.tuition_programmes p on p.grade=a.grade_level where a.id=any(ids);
  select coalesce(jsonb_agg(q order by q.billing_month desc,q.number),'[]') into v_invoices from(
    select i.id,i.application_id,i.number,i.billing_month,i.period_start,i.period_end,i.due_date,i.amount_cents,i.credited_cents,
      public.accounting_invoice_balance(i.id) as balance_cents from public.tuition_invoices i where i.application_id=any(ids) order by i.billing_month desc,i.number limit 500) q;
  select coalesce(jsonb_agg(q order by q.paid_on desc,q.number),'[]') into v_receipts from(
    select r0.id,r0.application_id,r0.number,r0.amount_cents,r0.paid_on,r0.method,r0.reference,r0.reversed_at,public.accounting_receipt_available(r0.id) as available_cents,
      coalesce((select jsonb_agg(jsonb_build_object('invoiceNumber',i.number,'learner',a.learner_name,'amountCents',public.accounting_allocation_net(p0.id))) from public.tuition_payments p0 join public.tuition_invoices i on i.id=p0.invoice_id join public.applications a on a.id=i.application_id where p0.receipt_id=r0.id and i.application_id=any(ids)),'[]') as allocations
    from public.accounting_receipts r0 where r0.billing_email=r.email order by r0.paid_on desc,r0.number limit 500)q;
  select coalesce(jsonb_agg(q order by q.issued_on desc,q.number),'[]') into v_credits from(
    select c.id,c.invoice_id,i.application_id,i.number as invoice_number,c.number,c.amount_cents,c.issued_on,c.reversed_at
    from public.accounting_credit_notes c join public.tuition_invoices i on i.id=c.invoice_id where i.application_id=any(ids) order by c.issued_on desc,c.number limit 500)q;
  select coalesce(jsonb_agg(q order by q.paid_on desc,q.number),'[]') into v_refunds from(
    select f.id,f.number,f.amount_cents,f.paid_on,f.method,f.reversed_at,r0.application_id
    from public.accounting_refunds f join public.accounting_receipts r0 on r0.id=f.receipt_id where r0.billing_email=r.email order by f.paid_on desc,f.number limit 500)q;
  return jsonb_build_object('today',public.tuition_today(),'parent',jsonb_build_object('email',r.email,'name',(select guardian_name from public.applications where id=any(ids) order by created_at limit 1)),
    'children',v_children,'invoices',v_invoices,'receipts',v_receipts,'creditNotes',v_credits,'refunds',v_refunds,
    'totals',jsonb_build_object('outstandingCents',coalesce((select sum(public.accounting_invoice_balance(id)) from public.tuition_invoices where application_id=any(ids)),0),
      'overdueCents',coalesce((select sum(public.accounting_invoice_balance(id)) from public.tuition_invoices where application_id=any(ids) and due_date<public.tuition_today()),0),
      'availableCreditCents',coalesce((select sum(public.accounting_receipt_available(id)) from public.accounting_receipts where billing_email=r.email),0)),
    'historyLimited', (select count(*)>500 from public.tuition_invoices where application_id=any(ids)) or (select count(*)>500 from public.accounting_receipts where billing_email=r.email)
      or (select count(*)>500 from public.accounting_credit_notes c join public.tuition_invoices i on i.id=c.invoice_id where i.application_id=any(ids))
      or (select count(*)>500 from public.accounting_refunds f join public.accounting_receipts r0 on r0.id=f.receipt_id where r0.billing_email=r.email));
end $$;

create or replace function public.parent_document(p_user uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.parent_accounts; ids uuid[]; v_app uuid; v_payload jsonb; v_void boolean; v_items jsonb; a public.applications;
begin
  r=public.parent_assert(p_user); select array_agg(id) into ids from public.parent_scope(p_user) id;
  if p_kind='invoice' then
    select application_id into v_app from public.tuition_invoices where id=p_id and application_id=any(ids);
    if v_app is not null then return jsonb_build_object('kind','invoice','id',p_id); end if;
  elsif p_kind='account_receipt' then
    select application_id,reversed_at is not null into v_app,v_void from public.accounting_receipts where id=p_id and billing_email=r.email;
  elsif p_kind='credit_note' then
    select i.application_id,c.reversed_at is not null into v_app,v_void from public.accounting_credit_notes c join public.tuition_invoices i on i.id=c.invoice_id where c.id=p_id and i.application_id=any(ids);
  elsif p_kind='refund' then
    select r0.application_id,f.reversed_at is not null into v_app,v_void from public.accounting_refunds f join public.accounting_receipts r0 on r0.id=f.receipt_id where f.id=p_id and r0.billing_email=r.email;
  elsif p_kind='statement' then
    select * into a from public.applications where id=p_id and id=any(ids);
    if a.id is null then raise exception 'Document unavailable for this account.'; end if;
    -- Family movements exclude allocation transfers and private staff notes.
    select coalesce(jsonb_agg(jsonb_build_object('date',q.posted_on,'description',q.description,'cents',q.cents) order by q.posted_on,q.created_at),'[]') into v_items from(
      select j.posted_on,j.created_at,case when j.reversal_of is not null then 'Correction · ' else '' end||
        case j.source_kind when 'invoice' then 'Tuition invoice' when 'receipt' then 'Payment received' when 'credit_note' then 'Tuition credit note' when 'refund' then 'Refund paid' else 'Account adjustment' end||' · '||coalesce(i.number,r0.number,c.number,f.number,left(j.id::text,8)) as description,sum(l.amount_cents) as cents
      from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id
      left join public.tuition_invoices i on i.id=j.source_id and j.source_kind='invoice'
      left join public.accounting_receipts r0 on r0.id=j.source_id and j.source_kind='receipt'
      left join public.accounting_credit_notes c on c.id=j.source_id and j.source_kind='credit_note'
      left join public.accounting_refunds f on f.id=j.source_id and j.source_kind='refund'
      where l.application_id=any(ids) and l.account_code in ('1100','2100') and j.posted_on<=public.tuition_today()
      group by j.id,i.number,r0.number,c.number,f.number having sum(l.amount_cents)<>0
    )q;
    if jsonb_array_length(v_items)>2000 then raise exception 'Contact Viva Tutorials for an extended account statement.'; end if;
    return jsonb_build_object('documentKind','statement','documentId',p_id,'documentNumber','Statement-'||a.application_number,'title','Family account statement','payer',a.guardian_name,'recipients',jsonb_build_array(r.email),'issuedOn',public.tuition_today(),'openingCents',0,'items',v_items,'totalCents',coalesce((select sum((x->>'cents')::bigint) from jsonb_array_elements(v_items)x),0),'note','All reviewed learners on your guardian account. Positive balance is owed to Viva; negative balance is family credit. Allocating existing funds is not another payment. ZAR; no VAT.');
  else raise exception 'Document unavailable for this account.';
  end if;
  if v_app is null or p_kind='invoice' then raise exception 'Document unavailable for this account.'; end if;
  select payload into v_payload from public.tuition_messages where event_key=p_kind||':'||p_id;
  if v_payload is null then raise exception 'The financial document snapshot is unavailable. Please contact Viva Tutorials.'; end if;
  return v_payload||jsonb_build_object('voided',v_void);
end $$;

revoke all on function public.parent_eligible(text),public.parent_signin_allowed(text),public.parent_rate_limit(text,text),public.parent_assert(uuid),public.parent_bind(uuid),public.parent_scope(uuid),public.admin_parent_access(uuid,uuid,boolean,text),public.parent_snapshot(uuid),public.parent_document(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.parent_signin_allowed(text),public.parent_rate_limit(text,text),public.parent_assert(uuid),public.parent_bind(uuid),public.admin_parent_access(uuid,uuid,boolean,text),public.parent_snapshot(uuid),public.parent_document(uuid,text,uuid) to service_role;

-- END PARENT PORTAL MIGRATION

-- BEGIN TEACHING FOUNDATION
-- Teaching release 1: private classes, sessions, resources and attendance.
do $$ begin
 if to_regprocedure('public.parent_scope(uuid)') is null then raise exception 'Apply the parent portal setup before teaching setup.'; end if;
end $$;
create table if not exists public.teaching_settings(singleton boolean primary key default true check(singleton));
insert into public.teaching_settings values(true) on conflict do nothing;
create table if not exists public.teaching_tutors(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 120),
 email text not null unique check(email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 user_id uuid unique references auth.users(id) on delete set null, enabled boolean not null default true,
 created_at timestamptz not null default now(), last_signed_in_at timestamptz
);
create table if not exists public.teaching_venues(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 120),
 mode text not null check(mode in ('Online','In-person')), detail text not null check(length(trim(detail)) between 3 and 1000),
 active boolean not null default true, check(mode<>'Online' or detail ~ '^https://[^[:space:]]+$')
);
create table if not exists public.teaching_topics(
 id uuid primary key default gen_random_uuid(), grade text not null references public.tuition_programmes(grade),
 subject text not null check(length(subject) between 2 and 100), title text not null check(length(trim(title)) between 2 and 160),
 goal text not null check(length(trim(goal)) between 5 and 600), active boolean not null default true,
 unique(grade,subject,title)
);
create table if not exists public.teaching_classes(
 id uuid primary key default gen_random_uuid(), name text not null, grade text not null references public.tuition_programmes(grade),
 subject text not null, group_name text not null check(group_name ~ '^[A-L]$'), season integer not null check(season between 2026 and 2100),
 tutor_id uuid not null references public.teaching_tutors(id), venue_id uuid not null references public.teaching_venues(id),
 weekdays smallint[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
 starts_at time not null, ends_at time not null, archived boolean not null default false,
 created_at timestamptz not null default now(), check(ends_at>starts_at), unique(grade,subject,group_name,season)
);
create table if not exists public.teaching_memberships(
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.teaching_classes(id), application_id uuid not null references public.applications(id),
 joined_on date not null, left_on date, unique(class_id,application_id,joined_on), check(left_on is null or left_on>=joined_on)
);
create unique index if not exists teaching_membership_current on public.teaching_memberships(class_id,application_id) where left_on is null;
create table if not exists public.teaching_sessions(
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.teaching_classes(id),
 topic_id uuid not null references public.teaching_topics(id), topic_title text not null, learning_goal text not null,
 tutor_id uuid not null references public.teaching_tutors(id), venue_name text not null, venue_detail text not null, mode text not null,
 starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 outcome text check(outcome in ('Objective covered','More practice needed','Follow-up planned')), staff_note text not null default '',
 cancel_reason text, revision integer not null default 0, created_at timestamptz not null default now(),
 check(ends_at>starts_at), check(length(staff_note)<=2000)
);
create index if not exists teaching_sessions_class on public.teaching_sessions(class_id,starts_at);
create table if not exists public.teaching_session_roster(
 session_id uuid not null references public.teaching_sessions(id), application_id uuid not null references public.applications(id),
 learner_name text not null, student_number text not null, starting_mark numeric(5,2), target_mark numeric(5,2),
 included boolean not null default true, attendance text check(attendance in ('present','late','absent','excused')),
 recorded_by uuid references auth.users(id), recorded_at timestamptz, primary key(session_id,application_id)
);
create index if not exists teaching_roster_learner on public.teaching_session_roster(application_id,session_id);
create table if not exists public.teaching_materials(
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 2 and 180),
 grade text not null references public.tuition_programmes(grade), subject text not null,
 kind text not null check(kind in ('Notes','Worksheet','Presentation','Question paper','Memorandum','Revision')),
 archived boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.teaching_material_versions(
 id uuid primary key, material_id uuid not null references public.teaching_materials(id), version integer not null check(version>0),
 file_name text not null check(length(file_name) between 1 and 200), storage_path text not null unique,
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 size_bytes integer not null check(size_bytes between 1 and 10485760), finalized_at timestamptz,
 created_at timestamptz not null default now(), unique(material_id,version)
);
create table if not exists public.teaching_class_materials(
 class_id uuid not null references public.teaching_classes(id), version_id uuid not null references public.teaching_material_versions(id),
 active boolean not null default true, primary key(class_id,version_id)
);
create table if not exists public.teaching_session_materials(
 session_id uuid not null references public.teaching_sessions(id), version_id uuid not null references public.teaching_material_versions(id),
 active boolean not null default true, primary key(session_id,version_id)
);
create table if not exists public.teaching_events(
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id), action text not null,
 class_id uuid references public.teaching_classes(id), session_id uuid references public.teaching_sessions(id),
 details jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.teaching_requests(
 id uuid primary key, actor_id uuid not null references auth.users(id), audience text not null, operation text not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('teaching-materials','teaching-materials',false,10485760,array['application/pdf','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.teaching_now() returns timestamptz language sql stable set search_path='' as $$select now()$$;
create or replace function public.tutor_signin_allowed(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teaching_tutors where email=lower(trim(p_email)) and enabled);
$$;
create or replace function public.tutor_assert(p_user uuid) returns public.teaching_tutors language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors; v_email text; v_confirmed timestamptz;
begin
 select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user;
 select * into t from public.teaching_tutors where user_id=p_user and email=v_email and enabled;
 if t.id is null or v_confirmed is null then raise exception 'Tutor access is unavailable. Contact Viva Tutorials.'; end if; return t;
end $$;
create or replace function public.tutor_bind(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.teaching_tutors; v_email text; v_confirmed timestamptz;
begin
 select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user;
 if v_confirmed is null then raise exception 'Verify your tutor email before signing in.'; end if;
 select * into t from public.teaching_tutors where email=v_email and enabled for update;
 if t.id is null or (t.user_id is not null and t.user_id<>p_user) then raise exception 'Tutor access is unavailable. Contact Viva Tutorials.'; end if;
 perform set_config('viva.teaching_actor',p_user::text,true);
 update public.teaching_tutors set user_id=p_user,last_signed_in_at=now() where id=t.id;
 return jsonb_build_object('id',p_user,'email',v_email,'name',t.name);
end $$;
create or replace function public.teaching_access(p_user uuid,p_audience text,p_class uuid default null) returns void language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors;
begin
 if p_audience='admin' then perform public.admin_assert(p_user);
 elsif p_audience='tutor' then
  t=public.tutor_assert(p_user);
  if p_class is not null and not exists(select 1 from public.teaching_classes where id=p_class and tutor_id=t.id and not archived) then raise exception 'This class is not assigned to you.'; end if;
 else raise exception 'Invalid teaching access.'; end if;
end $$;
create or replace function public.teaching_track_change() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; c uuid; s uuid;
begin
 if tg_op='DELETE' then raise exception 'Teaching history cannot be deleted. Archive or correct the record.'; end if;
 actor=nullif(current_setting('viva.teaching_actor',true),'')::uuid;
 if actor is null then raise exception 'Use an authorized teaching operation so its history is recorded.'; end if;
 if tg_table_name='teaching_classes' then c=new.id;
 elsif tg_table_name='teaching_sessions' then c=new.class_id; s=new.id;
 elsif tg_table_name in ('teaching_memberships','teaching_class_materials') then c=new.class_id;
 elsif tg_table_name in ('teaching_session_roster','teaching_session_materials') then s=new.session_id;select class_id into c from public.teaching_sessions where id=s;
 end if;
 insert into public.teaching_events(actor_id,action,class_id,session_id,details) values(actor,tg_table_name||':'||lower(tg_op),c,s,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;
create or replace function public.teaching_history_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Teaching audit and request history is immutable.'; end $$;
do $$ declare n text; begin
 foreach n in array array['teaching_tutors','teaching_venues','teaching_topics','teaching_classes','teaching_memberships','teaching_sessions','teaching_session_roster','teaching_materials','teaching_material_versions','teaching_class_materials','teaching_session_materials'] loop
  execute format('drop trigger if exists teaching_track on public.%I',n);
  execute format('create trigger teaching_track after insert or update or delete on public.%I for each row execute function public.teaching_track_change()',n);
 end loop;
 foreach n in array array['teaching_events','teaching_requests'] loop
  execute format('drop trigger if exists teaching_immutable on public.%I',n);
  execute format('create trigger teaching_immutable before update or delete on public.%I for each row execute function public.teaching_history_immutable()',n);
 end loop;
 foreach n in array array['teaching_settings','teaching_tutors','teaching_venues','teaching_topics','teaching_classes','teaching_memberships','teaching_sessions','teaching_session_roster','teaching_materials','teaching_material_versions','teaching_class_materials','teaching_session_materials','teaching_events','teaching_requests'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant all on public.%I to service_role',n);
 end loop;
end $$;
revoke all on function public.teaching_now(),public.tutor_signin_allowed(text),public.tutor_assert(uuid),public.tutor_bind(uuid),public.teaching_access(uuid,text,uuid),public.teaching_track_change(),public.teaching_history_immutable() from public,anon,authenticated;
grant execute on function public.tutor_signin_allowed(text),public.tutor_assert(uuid),public.tutor_bind(uuid) to service_role;


create or replace function public.teaching_mutate(p_actor uuid,p_audience text,p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare req public.teaching_requests; rid uuid=(p_data->>'requestId')::uuid; cid uuid=(p_data->>'classId')::uuid;
 sid uuid=(p_data->>'sessionId')::uuid; id uuid=(p_data->>'id')::uuid; vid uuid=(p_data->>'versionId')::uuid;
 c public.teaching_classes; s public.teaching_sessions; t public.teaching_tutors; topic public.teaching_topics; venue public.teaching_venues;
 mat public.teaching_materials; ver public.teaching_material_versions; a public.applications; e public.teaching_session_roster;
 result jsonb='{}'; day date; start_t time; end_t time; ds smallint[]; item jsonb; n integer; meta jsonb; reason text=trim(coalesce(p_data->>'reason',''));
begin
 if rid is null then raise exception 'A stable request ID is required.'; end if;
 perform public.teaching_access(p_actor,p_audience,cid);
 perform 1 from public.teaching_settings where singleton for update;
 select * into req from public.teaching_requests where teaching_requests.id=rid;
 if req.id is not null then
  if req.actor_id<>p_actor or req.audience<>p_audience or req.operation<>p_operation or req.payload<>p_data then raise exception 'This request ID was already used for another operation.'; end if; return req.result;
 end if;
 perform set_config('viva.teaching_actor',p_actor::text,true);
 if p_operation not in ('attendance','session_finish','session_material') and p_audience<>'admin' then raise exception 'Only administrators can change teaching setup.'; end if;
 if sid is not null then
  select * into s from public.teaching_sessions where teaching_sessions.id=sid for update;
  if s.id is null then raise exception 'Session not found.'; end if;
  perform public.teaching_access(p_actor,p_audience,s.class_id);
  if cid is not null and cid<>s.class_id then raise exception 'Session and class do not match.'; end if; cid=s.class_id;
 end if;
 if cid is not null then
  select * into c from public.teaching_classes where teaching_classes.id=cid;
  if c.id is null then raise exception 'Class not found.'; end if;
  if c.archived and p_operation<>'class_update' then raise exception 'This class is archived.'; end if;
 end if;
 if p_operation='tutor_save' then
  if id is null then
   insert into public.teaching_tutors(name,email) values(trim(p_data->>'name'),lower(trim(p_data->>'email'))) returning teaching_tutors.id into id;
  else
   if length(reason)<5 then raise exception 'Choose a reason for changing tutor access.'; end if;
   update public.teaching_tutors set enabled=(p_data->>'enabled')::boolean where teaching_tutors.id=id;
   if not found then raise exception 'Tutor not found.'; end if;
  end if; result=jsonb_build_object('id',id);
 elsif p_operation='venue_create' then
  insert into public.teaching_venues(name,mode,detail) values(trim(p_data->>'name'),p_data->>'mode',trim(p_data->>'detail')) returning teaching_venues.id into id;result=jsonb_build_object('id',id);
 elsif p_operation='topic_create' then
  if p_data->>'subject' not in ('Mathematics','Natural Sciences','Other academic support','Mathematical Literacy','Physical Sciences','Life Sciences') then raise exception 'Choose an enrollment subject.'; end if;
  insert into public.teaching_topics(grade,subject,title,goal) values(p_data->>'grade',p_data->>'subject',trim(p_data->>'title'),trim(p_data->>'goal')) returning teaching_topics.id into id;result=jsonb_build_object('id',id);
 elsif p_operation='class_create' then
  select * into t from public.teaching_tutors where teaching_tutors.id=(p_data->>'tutorId')::uuid and enabled;
  select * into venue from public.teaching_venues where teaching_venues.id=(p_data->>'venueId')::uuid and active;
  select array_agg(value::smallint) into ds from jsonb_array_elements_text(p_data->'weekdays');
  if t.id is null or venue.id is null or ds is null or not exists(select 1 from public.tuition_programmes where grade=p_data->>'grade' and ds<@weekdays) then raise exception 'Choose an enabled tutor, venue and valid programme days.'; end if;
  if p_data->>'subject' not in ('Mathematics','Natural Sciences','Other academic support','Mathematical Literacy','Physical Sciences','Life Sciences') then raise exception 'Choose an enrollment subject.'; end if;
  insert into public.teaching_classes(name,grade,subject,group_name,season,tutor_id,venue_id,weekdays,starts_at,ends_at)
   values((p_data->>'grade')||' · '||(p_data->>'subject')||' · Group '||(p_data->>'group'),p_data->>'grade',p_data->>'subject',p_data->>'group',(p_data->>'season')::integer,t.id,venue.id,ds,(p_data->>'startTime')::time,(p_data->>'endTime')::time) returning teaching_classes.id into id;
  result=jsonb_build_object('id',id);
 elsif p_operation='class_update' then
  if c.id is null or length(reason)<5 then raise exception 'Choose a class and a reason.'; end if;
  if p_data ? 'tutorId' then
   if not exists(select 1 from public.teaching_tutors where teaching_tutors.id=(p_data->>'tutorId')::uuid and enabled) then raise exception 'Choose an enabled tutor.'; end if;
   if exists(select 1 from public.teaching_sessions ss join public.teaching_sessions other on other.tutor_id=(p_data->>'tutorId')::uuid and other.class_id<>cid and other.status<>'cancelled' and other.starts_at<ss.ends_at and other.ends_at>ss.starts_at where ss.class_id=cid and ss.status='scheduled' and ss.starts_at>public.teaching_now()) then raise exception 'The new tutor has a conflicting future session.'; end if;
   update public.teaching_sessions set tutor_id=(p_data->>'tutorId')::uuid,revision=revision+1 where class_id=cid and status='scheduled' and starts_at>public.teaching_now();
   update public.teaching_classes set tutor_id=(p_data->>'tutorId')::uuid where teaching_classes.id=cid;
  end if;
  if coalesce((p_data->>'archived')::boolean,false) then update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where class_id=cid and status='scheduled' and starts_at>public.teaching_now(); end if;
  if p_data ? 'archived' then update public.teaching_classes set archived=(p_data->>'archived')::boolean where teaching_classes.id=cid;end if;
 elsif p_operation='membership' then
  if c.id is null then raise exception 'Choose a class.'; end if;
  day=(p_data->>'day')::date;
  if day is null or extract(year from day)<>c.season or extract(month from day) not between 2 and 11 then raise exception 'Choose an effective date in this teaching season.'; end if;
  if p_data->>'change'='add' then
   if jsonb_typeof(p_data->'learners')<>'array' or jsonb_array_length(p_data->'learners') not between 1 and 100 then raise exception 'Select between one and 100 learners.'; end if;
   if (select count(*) from public.teaching_memberships where class_id=cid and left_on is null)+jsonb_array_length(p_data->'learners')>100 then raise exception 'A class can have at most 100 current learners.'; end if;
   for item in select value from jsonb_array_elements(p_data->'learners') loop
    select * into a from public.applications where applications.id=(item#>>'{}')::uuid;
    if a.id is null or a.status<>'active' or a.enrollment_state<>'active' or a.grade_level<>c.grade or not(c.subject=any(a.selected_subjects)) then raise exception 'Select active learners enrolled in this grade and subject.'; end if;
    if exists(select 1 from public.teaching_memberships where class_id=cid and application_id=a.id and (left_on is null or left_on>day)) then raise exception 'This learner has an overlapping membership period.'; end if;
    if exists(select 1 from public.teaching_sessions mine join public.teaching_sessions other on other.class_id<>cid and other.status<>'cancelled' and other.starts_at<mine.ends_at and other.ends_at>mine.starts_at join public.teaching_session_roster other_r on other_r.session_id=other.id and other_r.application_id=a.id and other_r.included where mine.class_id=cid and mine.status='scheduled' and (mine.starts_at at time zone 'Africa/Johannesburg')::date>=day) then raise exception 'This learner has an overlapping session in another class.'; end if;
    if exists(select 1 from public.teaching_memberships where class_id=cid and application_id=a.id and joined_on=day) then raise exception 'A membership period already starts on this date. Choose a later return date.'; end if;
    insert into public.teaching_memberships(class_id,application_id,joined_on) values(cid,a.id,day);
    insert into public.teaching_session_roster(session_id,application_id,learner_name,student_number,starting_mark,target_mark)
     select ss.id,a.id,a.learner_name,l.student_number,m.current_mark,m.target_mark from public.teaching_sessions ss join public.learners l on l.application_id=a.id left join public.application_subjects m on m.application_id=a.id and m.subject_name=c.subject
     where ss.class_id=cid and ss.status='scheduled' and (ss.starts_at at time zone 'Africa/Johannesburg')::date>=day on conflict(session_id,application_id) do update set included=true where public.teaching_session_roster.attendance is null;
   end loop;
  elsif p_data->>'change'='remove' then
   if length(reason)<5 then raise exception 'Choose a reason for ending class membership.'; end if;
   update public.teaching_memberships set left_on=day where class_id=cid and application_id=(p_data->>'applicationId')::uuid and left_on is null;
   if not found then raise exception 'Active class membership not found.'; end if;
   update public.teaching_session_roster rr set included=false from public.teaching_sessions ss where rr.session_id=ss.id and ss.class_id=cid and ss.status='scheduled' and rr.application_id=(p_data->>'applicationId')::uuid and (ss.starts_at at time zone 'Africa/Johannesburg')::date>=day and rr.attendance is null;
  else raise exception 'Choose add or remove membership.'; end if;
 elsif p_operation='session_create' then
  day=(p_data->>'day')::date;start_t=coalesce(nullif(p_data->>'startTime','')::time,c.starts_at);end_t=coalesce(nullif(p_data->>'endTime','')::time,c.ends_at);
  select * into topic from public.teaching_topics where teaching_topics.id=(p_data->>'topicId')::uuid and active;
  select * into venue from public.teaching_venues where teaching_venues.id=c.venue_id and active;
  if c.id is null or day is null or topic.id is null or topic.grade<>c.grade or topic.subject<>c.subject or venue.id is null or not exists(select 1 from public.teaching_tutors where teaching_tutors.id=c.tutor_id and enabled) then raise exception 'Choose a class with an enabled tutor, venue and matching topic.'; end if;
  if extract(year from day)<>c.season or extract(month from day) not between 2 and 11 or not(extract(isodow from day)::smallint=any(c.weekdays)) or exists(select 1 from public.tuition_closures where tuition_closures.day=day) then raise exception 'Choose a scheduled day in the teaching season that is not a closure.'; end if;
  if end_t<=start_t then raise exception 'Session end must be after its start.'; end if;
  if exists(select 1 from public.teaching_sessions x where x.status<>'cancelled' and (x.tutor_id=c.tutor_id or x.class_id=cid or (x.mode=venue.mode and x.venue_detail=venue.detail and (venue.mode='Online' or x.venue_name=venue.name))) and x.starts_at<((day+end_t) at time zone 'Africa/Johannesburg') and x.ends_at>((day+start_t) at time zone 'Africa/Johannesburg')) then raise exception 'This time overlaps an existing class, tutor or classroom session.'; end if;
  if exists(select 1 from public.teaching_memberships mm join public.applications a0 on a0.id=mm.application_id join public.teaching_session_roster rr on rr.application_id=mm.application_id and rr.included join public.teaching_sessions other on other.id=rr.session_id and other.status<>'cancelled' where mm.class_id=cid and mm.joined_on<=day and (mm.left_on is null or mm.left_on>day) and a0.status='active' and a0.enrollment_state='active' and other.starts_at<((day+end_t) at time zone 'Africa/Johannesburg') and other.ends_at>((day+start_t) at time zone 'Africa/Johannesburg')) then raise exception 'A learner already has a session at this time.'; end if;
  insert into public.teaching_sessions(class_id,topic_id,topic_title,learning_goal,tutor_id,venue_name,venue_detail,mode,starts_at,ends_at)
   values(cid,topic.id,topic.title,topic.goal,c.tutor_id,venue.name,venue.detail,venue.mode,(day+start_t) at time zone 'Africa/Johannesburg',(day+end_t) at time zone 'Africa/Johannesburg') returning teaching_sessions.id into sid;
  insert into public.teaching_session_roster(session_id,application_id,learner_name,student_number,starting_mark,target_mark)
   select sid,a0.id,a0.learner_name,l.student_number,m.current_mark,m.target_mark from public.teaching_memberships mm join public.applications a0 on a0.id=mm.application_id join public.learners l on l.application_id=a0.id left join public.application_subjects m on m.application_id=a0.id and m.subject_name=c.subject
   where mm.class_id=cid and mm.joined_on<=day and (mm.left_on is null or mm.left_on>day) and a0.status='active' and a0.enrollment_state='active';
  insert into public.teaching_session_materials(session_id,version_id) select sid,version_id from public.teaching_class_materials where class_id=cid and active;
  result=jsonb_build_object('sessionId',sid);
 elsif p_operation='attendance' then
  if s.id is null or s.status='cancelled' or s.starts_at>public.teaching_now() then raise exception 'Record attendance only after a non-cancelled session starts.'; end if;
  if (p_data->>'revision')::integer is distinct from s.revision then raise exception 'This register changed. Refresh before saving.'; end if;
  if exists(select 1 from public.teaching_session_roster where session_id=sid and attendance is not null) and length(reason)<5 then raise exception 'Choose a correction reason for a completed register.'; end if;
  select count(*) into n from public.teaching_session_roster where session_id=sid and included;
  if n=0 or jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows')<>n or (select count(distinct value->>'applicationId') from jsonb_array_elements(p_data->'rows'))<>n then raise exception 'Choose attendance for every learner in this session exactly once.'; end if;
  for item in select value from jsonb_array_elements(p_data->'rows') loop
   if not exists(select 1 from public.teaching_session_roster where session_id=sid and application_id=(item->>'applicationId')::uuid and included) or item->>'status' not in ('present','late','absent','excused') or item->>'status' is null then raise exception 'Choose a valid learner and attendance status.'; end if;
   update public.teaching_session_roster set attendance=item->>'status',recorded_by=p_actor,recorded_at=now() where session_id=sid and application_id=(item->>'applicationId')::uuid;
  end loop;
  update public.teaching_sessions set revision=revision+1 where teaching_sessions.id=sid;
 elsif p_operation='session_finish' then
  if s.id is null or (p_data->>'revision')::integer is distinct from s.revision then raise exception 'This session changed. Refresh before saving.'; end if;
  if p_data->>'status'='completed' then
   if s.status<>'scheduled' or s.ends_at>public.teaching_now() or not exists(select 1 from public.teaching_session_roster where session_id=sid and included) or exists(select 1 from public.teaching_session_roster where session_id=sid and included and attendance is null) then raise exception 'Complete an ended session after recording every learner attendance status.'; end if;
   if p_data->>'outcome' not in ('Objective covered','More practice needed','Follow-up planned') or p_data->>'outcome' is null then raise exception 'Choose a teaching outcome.'; end if;
   update public.teaching_sessions set status='completed',outcome=p_data->>'outcome',staff_note=coalesce(p_data->>'staffNote',''),revision=revision+1 where teaching_sessions.id=sid;
  elsif p_data->>'status'='cancelled' then
   if s.status<>'scheduled' or length(reason)<5 then raise exception 'Cancel a scheduled session with a reason.'; end if;
   update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where teaching_sessions.id=sid;
  else raise exception 'Choose complete or cancel.'; end if;
 elsif p_operation='material_prepare' then
  if id is null then raise exception 'A stable upload version ID is required.'; end if;
  if p_data->>'materialId' is not null then
   select * into mat from public.teaching_materials where teaching_materials.id=(p_data->>'materialId')::uuid and not archived;
   if mat.id is null then raise exception 'Material not found.'; end if;
  else
   insert into public.teaching_materials(title,grade,subject,kind) values(trim(p_data->>'title'),p_data->>'grade',p_data->>'subject',p_data->>'kind') returning * into mat;
  end if;
  insert into public.teaching_material_versions(id,material_id,version,file_name,storage_path,mime,size_bytes)
   select id,mat.id,coalesce(max(version),0)+1,p_data->>'name',mat.id||'/'||id||case p_data->>'mime' when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_data->>'mime',(p_data->>'size')::integer from public.teaching_material_versions where material_id=mat.id returning * into ver;
  result=to_jsonb(ver);
 elsif p_operation='material_resume' then
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid and finalized_at is null;
  if ver.id is null or ver.file_name is distinct from p_data->>'name' or ver.size_bytes is distinct from (p_data->>'size')::integer or ver.mime is distinct from p_data->>'mime' then raise exception 'Choose the original pending file with its recorded name, size and type.'; end if;
  result=to_jsonb(ver);
 elsif p_operation='material_finalize' then
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid;
  if ver.id is null then raise exception 'Upload not found.'; end if;
  if not exists(select 1 from storage.buckets where storage.buckets.id='teaching-materials' and not public) then raise exception 'The teaching materials bucket must be private.'; end if;
  select metadata into meta from storage.objects where bucket_id='teaching-materials' and name=ver.storage_path;
  if meta is null or coalesce(meta->>'size','')!~'^[0-9]+$' or (meta->>'size')::bigint<>ver.size_bytes or lower(split_part(coalesce(meta->>'mimetype',''),';',1))<>ver.mime then raise exception 'The uploaded file size and type could not be verified.'; end if;
  update public.teaching_material_versions set finalized_at=coalesce(finalized_at,now()) where teaching_material_versions.id=vid returning * into ver;result=to_jsonb(ver);
 elsif p_operation in ('class_material','session_material') then
  if c.id is null then raise exception 'Choose a class.'; end if;
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid and finalized_at is not null;
  select * into mat from public.teaching_materials where teaching_materials.id=ver.material_id;
  if ver.id is null or mat.archived or mat.grade<>c.grade or mat.subject<>c.subject then raise exception 'Choose a verified material for this grade and subject.'; end if;
  if p_operation='class_material' then
   insert into public.teaching_class_materials(class_id,version_id,active) values(cid,vid,coalesce((p_data->>'active')::boolean,true)) on conflict(class_id,version_id) do update set active=excluded.active;
  else
   if s.id is null or s.status<>'scheduled' then raise exception 'Change resources only on a scheduled session.'; end if;
   if p_audience='tutor' and not exists(select 1 from public.teaching_class_materials where class_id=cid and version_id=vid and active) then raise exception 'Select a resource assigned to this class.'; end if;
   insert into public.teaching_session_materials(session_id,version_id,active) values(sid,vid,coalesce((p_data->>'active')::boolean,true)) on conflict(session_id,version_id) do update set active=excluded.active;
  end if;
 else raise exception 'Unknown teaching operation.'; end if;
 insert into public.teaching_events(actor_id,action,class_id,session_id,details) values(p_actor,p_operation,cid,sid,jsonb_build_object('requestId',rid,'reason',reason));
 insert into public.teaching_requests(id,actor_id,audience,operation,payload,result) values(rid,p_actor,p_audience,p_operation,p_data,result);
 return result;
end $$;
revoke all on function public.teaching_mutate(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.teaching_mutate(uuid,text,text,jsonb) to service_role;


create or replace function public.teaching_snapshot(p_actor uuid,p_audience text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors; ids uuid[]; sessions uuid[]; versions uuid[]; result jsonb;
begin
 perform public.teaching_access(p_actor,p_audience);
 if p_audience='tutor' then t=public.tutor_assert(p_actor); end if;
 select coalesce(array_agg(id),'{}') into ids from public.teaching_classes where p_audience='admin' or (tutor_id=t.id and not archived);
 select coalesce(array_agg(id),'{}') into sessions from (select id from public.teaching_sessions where class_id=any(ids) order by starts_at desc limit 1000)x;
 select coalesce(array_agg(distinct version_id),'{}') into versions from(
  select version_id from public.teaching_class_materials where class_id=any(ids) and active union select version_id from public.teaching_session_materials where session_id=any(sessions) and active)x;
 result=jsonb_build_object('today',(public.teaching_now() at time zone 'Africa/Johannesburg')::date,'now',public.teaching_now(),'audience',p_audience,'tutorName',t.name,
  'programmes',(select coalesce(jsonb_agg(jsonb_build_object('grade',grade,'weekdays',weekdays) order by grade),'[]') from public.tuition_programmes),
  'closures',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'reason',reason) order by day),'[]') from public.tuition_closures),
  'tutors',case when p_audience='admin' then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'enabled',enabled,'registered',user_id is not null) order by name),'[]') from public.teaching_tutors) else '[]'::jsonb end,
  'venues',case when p_audience='admin' then (select coalesce(jsonb_agg(to_jsonb(v) order by name),'[]') from public.teaching_venues v) else '[]'::jsonb end,
  'topics',(select coalesce(jsonb_agg(to_jsonb(q) order by q.grade,q.subject,q.title),'[]') from public.teaching_topics q where p_audience='admin' or exists(select 1 from public.teaching_classes c where c.id=any(ids) and c.grade=q.grade and c.subject=q.subject)),
  'learners',case when p_audience='admin' then (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.learner_name,'studentNumber',l.student_number,'grade',a.grade_level,'subjects',a.selected_subjects) order by a.learner_name),'[]') from public.applications a join public.learners l on l.application_id=a.id where a.status='active' and a.enrollment_state='active') else '[]'::jsonb end,
  'classes',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('tutorName',tt.name,'venueName',v.name,'mode',v.mode) order by c.name),'[]') from public.teaching_classes c join public.teaching_tutors tt on tt.id=c.tutor_id join public.teaching_venues v on v.id=c.venue_id where c.id=any(ids)),
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',mm.id,'class_id',mm.class_id,'application_id',mm.application_id,'joined_on',mm.joined_on,'left_on',mm.left_on,'name',a.learner_name,'studentNumber',l.student_number,'state',a.enrollment_state,'startingMark',m.current_mark,'targetMark',m.target_mark) order by a.learner_name),'[]') from public.teaching_memberships mm join public.teaching_classes c on c.id=mm.class_id join public.applications a on a.id=mm.application_id join public.learners l on l.application_id=a.id left join public.application_subjects m on m.application_id=a.id and m.subject_name=c.subject where mm.class_id=any(ids)),
  'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by starts_at desc),'[]') from public.teaching_sessions s where id=any(sessions)),
  'roster',(select coalesce(jsonb_agg(to_jsonb(r) order by learner_name),'[]') from public.teaching_session_roster r where session_id=any(sessions)),
  'materials',(select coalesce(jsonb_agg(to_jsonb(m) order by created_at desc),'[]') from public.teaching_materials m where p_audience='admin' or exists(select 1 from public.teaching_material_versions v where v.material_id=m.id and v.id=any(versions))),
  'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'material_id',v.material_id,'version',v.version,'file_name',v.file_name,'mime',v.mime,'size_bytes',v.size_bytes,'finalized_at',v.finalized_at) order by v.created_at desc),'[]') from public.teaching_material_versions v where p_audience='admin' or v.id=any(versions)),
  'classMaterials',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.teaching_class_materials m where class_id=any(ids)),
  'sessionMaterials',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.teaching_session_materials m where session_id=any(sessions)),
  'history',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'class_id',e.class_id,'session_id',e.session_id,'created_at',e.created_at,'reason',e.details->>'reason') order by e.created_at desc),'[]') from(select * from public.teaching_events where p_audience='admin' or class_id=any(ids) order by created_at desc limit 200)e),
  'limited',(select count(*)>1000 from public.teaching_sessions where class_id=any(ids)));
 return result;
end $$;
create or replace function public.teaching_file(p_actor uuid,p_audience text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v public.teaching_material_versions; t public.teaching_tutors;
begin
 perform public.teaching_access(p_actor,p_audience);
 select * into v from public.teaching_material_versions where id=p_id and finalized_at is not null;
 if v.id is null then raise exception 'Verified teaching file not found.'; end if;
 if p_audience='tutor' then
  t=public.tutor_assert(p_actor);
  if not exists(select 1 from public.teaching_class_materials cm join public.teaching_classes c on c.id=cm.class_id where cm.version_id=v.id and cm.active and c.tutor_id=t.id and not c.archived)
   and not exists(select 1 from public.teaching_session_materials sm join public.teaching_sessions s on s.id=sm.session_id join public.teaching_classes c on c.id=s.class_id where sm.version_id=v.id and sm.active and c.tutor_id=t.id and not c.archived) then raise exception 'This teaching file is not assigned to your classes.'; end if;
 end if; return to_jsonb(v);
end $$;
create or replace function public.teaching_parent_snapshot(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; result jsonb;
begin
 perform public.parent_assert(p_user);select array_agg(id) into ids from public.parent_scope(p_user) id;
 select jsonb_build_object('records',coalesce((select jsonb_agg(q order by q.starts_at desc) from(
  select rr.application_id,s.id as session_id,c.name as class_name,c.subject,s.topic_title,s.learning_goal,s.starts_at,s.ends_at,s.status,s.outcome,rr.attendance,rr.recorded_at
  from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id join public.teaching_classes c on c.id=s.class_id
  where rr.application_id=any(ids) and rr.included and s.status in ('completed','cancelled') order by s.starts_at desc limit 200)q),'[]'),
 'upcoming',coalesce((select jsonb_agg(q order by q.starts_at) from(
  select rr.application_id,c.name as class_name,c.subject,s.topic_title,s.starts_at,s.ends_at,s.mode,s.venue_name
  from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id join public.teaching_classes c on c.id=s.class_id
  where rr.application_id=any(ids) and rr.included and s.status='scheduled' and s.ends_at>=public.teaching_now() and not c.archived order by s.starts_at limit 30)q),'[]'),
 'summary',coalesce((select jsonb_agg(q) from(
  select rr.application_id,count(*)::integer as completed,
   count(*) filter(where rr.attendance in ('present','late'))::integer as attended,
   count(*) filter(where rr.attendance='absent')::integer as absent,
   count(*) filter(where rr.attendance='excused')::integer as excused,
   round(100.0*count(*) filter(where rr.attendance in ('present','late'))/nullif(count(*) filter(where rr.attendance in ('present','late','absent')),0),1) as percentage
  from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id where rr.application_id=any(ids) and rr.included and s.status='completed' group by rr.application_id)q),'[]'),
 'limited',(select count(*)>200 from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id where rr.application_id=any(ids) and rr.included and s.status in ('completed','cancelled'))) into result;
 return result;
end $$;
revoke all on function public.teaching_snapshot(uuid,text),public.teaching_file(uuid,text,uuid),public.teaching_parent_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.teaching_snapshot(uuid,text),public.teaching_file(uuid,text,uuid),public.teaching_parent_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
create or replace function public.teaching_history(p_actor uuid,p_audience text,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cid uuid; result jsonb;
begin
 select class_id into cid from public.teaching_sessions where id=p_session;
 if cid is null then raise exception 'Session not found.'; end if;
 perform public.teaching_access(p_actor,p_audience,cid);
 select coalesce(jsonb_agg(q order by q.created_at),'[]') into result from(
  select e.id,e.action,e.created_at,coalesce(t.name,'Viva administrator') as actor,e.details
  from public.teaching_events e left join public.teaching_tutors t on t.user_id=e.actor_id
  where e.session_id=p_session order by e.created_at limit 1001)q;
 if jsonb_array_length(result)>1000 then raise exception 'Contact Viva for an extended session audit export.'; end if;
 return jsonb_build_object('events',result);
end $$;
revoke all on function public.teaching_history(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.teaching_history(uuid,text,uuid) to service_role;


-- Teaching release 2. Additive upgrade: existing attendance, files and finance are preserved.
create table if not exists public.teaching_slots(
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.teaching_classes(id),
 weekday smallint not null check(weekday between 1 and 7), starts_at time not null, ends_at time not null,
 active boolean not null default true, check(ends_at>starts_at), unique(class_id,weekday,starts_at,ends_at)
);
create table if not exists public.student_accounts(
 application_id uuid primary key references public.applications(id), email text not null unique,
 user_id uuid unique references auth.users(id) on delete set null, enabled boolean not null default true,
 check(email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
alter table public.teaching_sessions add column if not exists series_id uuid;
alter table public.teaching_materials add column if not exists owner_class_id uuid references public.teaching_classes(id);
alter table public.teaching_class_materials add column if not exists learner_visible boolean not null default false;
alter table public.teaching_session_materials add column if not exists learner_visible boolean not null default false;
-- Backfill only on first upgrade; subsequent runs must not restore retired slots.
do $$ begin
 if not exists(select 1 from public.teaching_slots) then
  insert into public.teaching_slots(class_id,weekday,starts_at,ends_at)
   select c.id,d,c.starts_at,c.ends_at from public.teaching_classes c cross join lateral unnest(c.weekdays) d on conflict do nothing;
 end if;
end $$;
create or replace function public.teaching_seed_slots() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.teaching_slots(class_id,weekday,starts_at,ends_at) select new.id,d,new.starts_at,new.ends_at from unnest(new.weekdays) d;
 return new;
end $$;
drop trigger if exists teaching_seed on public.teaching_classes;
create trigger teaching_seed after insert on public.teaching_classes for each row execute function public.teaching_seed_slots();
do $$ declare n text; begin foreach n in array array['teaching_slots','student_accounts'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant all on public.%I to service_role',n);
 execute format('drop trigger if exists teaching_track on public.%I',n);
 execute format('create trigger teaching_track after insert or update or delete on public.%I for each row execute function public.teaching_track_change()',n);
end loop; end $$;
create or replace function public.teaching_slot_issue(p_class uuid,p_day date,p_start time,p_end time,p_exclude uuid default null) returns text
language plpgsql stable security definer set search_path='' as $$
declare c public.teaching_classes; v public.teaching_venues; d integer=extract(isodow from p_day);
begin
 select * into c from public.teaching_classes where id=p_class;
 select * into v from public.teaching_venues where id=c.venue_id and active;
 if c.id is null or c.archived or v.id is null or not exists(select 1 from public.teaching_tutors where id=c.tutor_id and enabled) then return 'Class, tutor or room is unavailable'; end if;
 if p_day is null or extract(year from p_day)<>c.season or extract(month from p_day) not between 2 and 11 or not(d=any(c.weekdays)) then return 'Outside the teaching season or class days'; end if;
 if exists(select 1 from public.tuition_closures where day=p_day) then return 'Configured closure'; end if;
 if p_start is null or p_end is null or p_end<=p_start then return 'Choose a valid time slot'; end if;
 if c.grade='Matric Rewrite' then
  if p_start<time '09:00' or p_end>time '12:00' or (d in (1,3) and c.subject not in ('Mathematics','Mathematical Literacy')) or (d in (2,4) and c.subject not in ('Physical Sciences','Life Sciences')) then return 'Outside this subject programme'; end if;
 elsif d<=5 and (p_start<time '16:00' or p_end>time '19:00') then return 'Afternoon programme runs 16:00–19:00';
 elsif d=7 and (c.grade<>'Grade 12' or v.mode<>'Online') then return 'Sunday is Grade 12 online feedback'; end if;
 if exists(select 1 from public.teaching_sessions x where x.id is distinct from p_exclude and x.status<>'cancelled' and
 (x.tutor_id=c.tutor_id or x.class_id=c.id or (x.mode=v.mode and x.venue_detail=v.detail and (v.mode='Online' or x.venue_name=v.name)))
 and x.starts_at<((p_day+p_end) at time zone 'Africa/Johannesburg') and x.ends_at>((p_day+p_start) at time zone 'Africa/Johannesburg')) then return 'Time overlaps a class, tutor or room session'; end if;
 if exists(select 1 from public.teaching_memberships mm join public.applications a on a.id=mm.application_id
 join public.teaching_session_roster rr on rr.application_id=mm.application_id and rr.included
 join public.teaching_sessions s on s.id=rr.session_id and s.status<>'cancelled' and s.id is distinct from p_exclude
 where mm.class_id=c.id and mm.joined_on<=p_day and (mm.left_on is null or mm.left_on>p_day) and a.status='active' and a.enrollment_state='active'
 and s.starts_at<((p_day+p_end) at time zone 'Africa/Johannesburg') and s.ends_at>((p_day+p_start) at time zone 'Africa/Johannesburg')) then return 'A learner has an overlapping session'; end if;
 return null;
end $$;
create or replace function public.teaching_schedule(p_actor uuid,p_audience text,p_class uuid,p_day date,p_slot uuid default null,p_until date default null,p_exclude uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare slots jsonb; dates jsonb='[]'; sl public.teaching_slots; dt date=p_day; issue text; n integer=0;
begin
 perform public.teaching_access(p_actor,p_audience,p_class);
 if p_exclude is not null and not exists(select 1 from public.teaching_sessions where id=p_exclude and class_id=p_class and status='scheduled' and starts_at>public.teaching_now()) then raise exception 'Only future scheduled sessions can be rescheduled.'; end if;
 if p_day is null or (p_until is not null and (p_until<p_day or p_until>p_day+77)) then raise exception 'Choose a date range of at most twelve weekly sessions.'; end if;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('issue',public.teaching_slot_issue(p_class,p_day,s.starts_at,s.ends_at,p_exclude)) order by s.starts_at),'[]') into slots from public.teaching_slots s where s.class_id=p_class and s.active and s.weekday=extract(isodow from p_day);
 if p_slot is not null then
  select * into sl from public.teaching_slots where id=p_slot and class_id=p_class and active and weekday=extract(isodow from p_day);
  if sl.id is null then raise exception 'Choose a saved time slot for this day.'; end if;
  while dt<=coalesce(p_until,p_day) loop
   issue=public.teaching_slot_issue(p_class,dt,sl.starts_at,sl.ends_at,p_exclude);
   dates=dates||jsonb_build_array(jsonb_build_object('day',dt,'startTime',sl.starts_at,'endTime',sl.ends_at,'issue',issue)); dt=dt+7;n=n+1;
  end loop;
 end if;
 return jsonb_build_object('slots',slots,'dates',dates);
end $$;

create or replace function public.teaching_slot_issue_excluding(p_class uuid,p_day date,p_start time,p_end time,p_excludes uuid[]) returns text
language plpgsql stable security definer set search_path='' as $$
declare c public.teaching_classes; v public.teaching_venues; d integer=extract(isodow from p_day);
begin
 select * into c from public.teaching_classes where id=p_class;
 select * into v from public.teaching_venues where id=c.venue_id and active;
 if c.id is null or c.archived or v.id is null or not exists(select 1 from public.teaching_tutors where id=c.tutor_id and enabled) then return 'Class, tutor or room is unavailable'; end if;
 if p_day is null or extract(year from p_day)<>c.season or extract(month from p_day) not between 2 and 11 or not(d=any(c.weekdays)) then return 'Outside the teaching season or class days'; end if;
 if exists(select 1 from public.tuition_closures where day=p_day) then return 'Configured closure'; end if;
 if p_start is null or p_end is null or p_end<=p_start then return 'Choose a valid time slot'; end if;
 if c.grade='Matric Rewrite' then
  if p_start<time '09:00' or p_end>time '12:00' or (d in (1,3) and c.subject not in ('Mathematics','Mathematical Literacy')) or (d in (2,4) and c.subject not in ('Physical Sciences','Life Sciences')) then return 'Outside this subject programme'; end if;
 elsif d<=5 and (p_start<time '16:00' or p_end>time '19:00') then return 'Afternoon programme runs 16:00–19:00';
 elsif d=7 and (c.grade<>'Grade 12' or v.mode<>'Online') then return 'Sunday is Grade 12 online feedback'; end if;
 if exists(select 1 from public.teaching_sessions x where x.id<>all(coalesce(p_excludes,'{}'::uuid[])) and x.status<>'cancelled' and
 (x.tutor_id=c.tutor_id or x.class_id=c.id or (x.mode=v.mode and x.venue_detail=v.detail and (v.mode='Online' or x.venue_name=v.name)))
 and x.starts_at<((p_day+p_end) at time zone 'Africa/Johannesburg') and x.ends_at>((p_day+p_start) at time zone 'Africa/Johannesburg')) then return 'Time overlaps a class, tutor or room session'; end if;
 if exists(select 1 from public.teaching_memberships mm join public.applications a on a.id=mm.application_id
 join public.teaching_session_roster rr on rr.application_id=mm.application_id and rr.included
 join public.teaching_sessions s on s.id=rr.session_id and s.status<>'cancelled' and s.id<>all(coalesce(p_excludes,'{}'::uuid[]))
 where mm.class_id=c.id and mm.joined_on<=p_day and (mm.left_on is null or mm.left_on>p_day) and a.status='active' and a.enrollment_state='active'
 and s.starts_at<((p_day+p_end) at time zone 'Africa/Johannesburg') and s.ends_at>((p_day+p_start) at time zone 'Africa/Johannesburg')) then return 'A learner has an overlapping session'; end if;
 return null;
end $$;
create or replace function public.teaching_series_preview(p_actor uuid,p_audience text,p_session uuid,p_day date,p_slot uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.teaching_sessions; target public.teaching_sessions; sl public.teaching_slots; ids uuid[]; dt date; slots jsonb; dates jsonb='[]'; issue text;
begin
 select * into s from public.teaching_sessions where id=p_session and status='scheduled' and starts_at>public.teaching_now();
 if s.id is null or p_day is null then raise exception 'Choose a future scheduled session and replacement date.'; end if;
 perform public.teaching_access(p_actor,p_audience,s.class_id);
 select array_agg(id) into ids from public.teaching_sessions where class_id=s.class_id and status='scheduled' and starts_at>=s.starts_at and (id=s.id or (s.series_id is not null and series_id=s.series_id));
 if cardinality(ids)>12 then raise exception 'Review at most twelve future sessions at a time.'; end if;
 select coalesce(jsonb_agg(to_jsonb(ts)||jsonb_build_object('issue',public.teaching_slot_issue_excluding(s.class_id,p_day,ts.starts_at,ts.ends_at,ids)) order by ts.starts_at),'[]') into slots from public.teaching_slots ts where class_id=s.class_id and active and weekday=extract(isodow from p_day);
 if p_slot is not null then
  select * into sl from public.teaching_slots where id=p_slot and class_id=s.class_id and active and weekday=extract(isodow from p_day);
  if sl.id is null then raise exception 'Choose a saved time slot for this day.'; end if;
  for target in select * from public.teaching_sessions where id=any(ids) order by starts_at loop
   dt=p_day+((target.starts_at at time zone 'Africa/Johannesburg')::date-(s.starts_at at time zone 'Africa/Johannesburg')::date);
   issue=public.teaching_slot_issue_excluding(s.class_id,dt,sl.starts_at,sl.ends_at,ids);
   if (dt+sl.starts_at) at time zone 'Africa/Johannesburg'<=public.teaching_now() then issue='Replacement sessions must be in the future'; end if;
   dates=dates||jsonb_build_array(jsonb_build_object('oldId',target.id,'day',dt,'startTime',sl.starts_at,'endTime',sl.ends_at,'issue',issue));
  end loop;
 end if;
 return jsonb_build_object('slots',slots,'dates',dates);
end $$;
create or replace function public.teaching_mutate(p_actor uuid,p_audience text,p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare req public.teaching_requests; rid uuid=(p_data->>'requestId')::uuid; cid uuid=(p_data->>'classId')::uuid;
 sid uuid=(p_data->>'sessionId')::uuid; id uuid=(p_data->>'id')::uuid; vid uuid=(p_data->>'versionId')::uuid;
 c public.teaching_classes; s public.teaching_sessions; t public.teaching_tutors; topic public.teaching_topics; venue public.teaching_venues;
 mat public.teaching_materials; ver public.teaching_material_versions; a public.applications; e public.teaching_session_roster;
 result jsonb='{}'; schedule jsonb; occurrence jsonb; slot public.teaching_slots; first_sid uuid; day date; start_t time; end_t time; ds smallint[]; item jsonb; n integer; meta jsonb; reason text=trim(coalesce(p_data->>'reason',''));
begin
 if rid is null then raise exception 'A stable request ID is required.'; end if;
 perform public.teaching_access(p_actor,p_audience,cid);
 perform 1 from public.teaching_settings where singleton for update;
 select * into req from public.teaching_requests where teaching_requests.id=rid;
 if req.id is not null then
  if req.actor_id<>p_actor or req.audience<>p_audience or req.operation<>p_operation or req.payload<>p_data then raise exception 'This request ID was already used for another operation.'; end if; return req.result;
 end if;
 perform set_config('viva.teaching_actor',p_actor::text,true);
 if p_operation not in ('attendance','session_finish','session_material','session_create','topic_create','material_prepare','material_resume','material_finalize','class_material','material_release','session_reschedule') and p_audience<>'admin' then raise exception 'Only administrators can change teaching setup.'; end if;
 if sid is not null then
  select * into s from public.teaching_sessions where teaching_sessions.id=sid for update;
  if s.id is null then raise exception 'Session not found.'; end if;
  perform public.teaching_access(p_actor,p_audience,s.class_id);
  if cid is not null and cid<>s.class_id then raise exception 'Session and class do not match.'; end if; cid=s.class_id;
 end if;
 if cid is not null then
  select * into c from public.teaching_classes where teaching_classes.id=cid;
  if c.id is null then raise exception 'Class not found.'; end if;
  if c.archived and p_operation<>'class_update' then raise exception 'This class is archived.'; end if;
 end if;
 if p_audience='tutor' and p_operation in ('topic_create','material_prepare','material_resume','material_finalize','class_material','material_release','session_create','session_reschedule') then
  if c.id is null then raise exception 'Only administrators can change setup without an assigned class.'; end if;
  if p_operation='topic_create' and (p_data->>'grade' is distinct from c.grade or p_data->>'subject' is distinct from c.subject) then raise exception 'Choose this class grade and subject.'; end if;
  if p_operation in ('material_resume','material_finalize','material_release','class_material') and not exists(
   select 1 from public.teaching_material_versions mv join public.teaching_materials m on m.id=mv.material_id where mv.id=vid and (m.owner_class_id=c.id or exists(select 1 from public.teaching_class_materials cm where cm.class_id=c.id and cm.version_id=vid and cm.active))) then raise exception 'This material is not owned by or assigned to this class.'; end if;
  if p_operation in ('material_resume','material_finalize') and not exists(select 1 from public.teaching_material_versions mv join public.teaching_materials m on m.id=mv.material_id where mv.id=vid and m.owner_class_id=c.id) then raise exception 'Only the owning class can finish an upload.'; end if;
 end if;
 if p_operation='student_access' then
  perform public.admin_assert(p_actor);
  select * into a from public.applications where applications.id=(p_data->>'applicationId')::uuid;
  if a.id is null or a.status<>'active' or a.enrollment_state<>'active' or length(reason)<5 then raise exception 'Choose an active learner and confirm the access review.'; end if;
  if coalesce((p_data->>'enabled')::boolean,true) then
   if lower(trim(a.learner_email))=lower(trim(a.guardian_email)) then raise exception 'Use parent-assisted learning when the learner shares the guardian email.'; end if;
   insert into public.student_accounts(application_id,email) values(a.id,lower(trim(a.learner_email)))
   on conflict(application_id) do update set email=excluded.email,user_id=case when student_accounts.email=excluded.email then student_accounts.user_id else null end,enabled=true;
  else update public.student_accounts set enabled=false where application_id=a.id; end if;
  result=jsonb_build_object('applicationId',a.id);
 elsif p_operation='slot_save' then
  perform public.admin_assert(p_actor);
  if c.id is null or length(reason)<5 then raise exception 'Choose a class and timetable change reason.'; end if;
  if id is not null then update public.teaching_slots set active=false where teaching_slots.id=id and class_id=c.id;
   if not found then raise exception 'Time slot not found.'; end if;
  else
   if not((p_data->>'weekday')::smallint=any(c.weekdays)) then raise exception 'Choose a class teaching day.'; end if;
   start_t=(p_data->>'startTime')::time;end_t=(p_data->>'endTime')::time;
   if start_t is null or end_t is null or end_t<=start_t then raise exception 'Choose a valid slot.'; end if;
   if c.grade='Matric Rewrite' and (start_t<time '09:00' or end_t>time '12:00') or c.grade<>'Matric Rewrite' and (p_data->>'weekday')::integer<=5 and (start_t<time '16:00' or end_t>time '19:00') then raise exception 'Choose times within the enrollment programme.'; end if;
   if exists(select 1 from public.teaching_slots ts where ts.class_id=c.id and ts.weekday=(p_data->>'weekday')::integer and ts.active and ts.starts_at<end_t and ts.ends_at>start_t) then raise exception 'This slot overlaps an existing timetable slot. Retire the old slot first.'; end if;
   insert into public.teaching_slots(class_id,weekday,starts_at,ends_at) values(c.id,(p_data->>'weekday')::smallint,start_t,end_t) on conflict(class_id,weekday,starts_at,ends_at) do update set active=true;
  end if;
  -- Slot edits never rewrite sessions already on the calendar.
 elsif p_operation='material_release' then
  if c.id is null then raise exception 'Choose a class.'; end if;
  if sid is null then update public.teaching_class_materials set learner_visible=(p_data->>'visible')::boolean where class_id=c.id and version_id=vid and active;
  else update public.teaching_session_materials set learner_visible=(p_data->>'visible')::boolean where session_id=sid and version_id=vid and active; end if;
  if not found then raise exception 'Attach the verified resource before releasing it.'; end if;
 elsif p_operation='session_reschedule' then
  if s.id is null or s.status<>'scheduled' or s.starts_at<=public.teaching_now() or (p_data->>'revision')::integer is distinct from s.revision or length(reason)<5 then raise exception 'Choose a future unchanged session and a reason.'; end if;
  if p_data->>'scope'='series' then
   schedule=public.teaching_series_preview(p_actor,p_audience,s.id,(p_data->>'day')::date,(p_data->>'slotId')::uuid);
   if jsonb_array_length(schedule->'dates')=0 or exists(select 1 from jsonb_array_elements(schedule->'dates') d where d->>'issue' is not null) then raise exception 'One or more replacement dates are unavailable. Review every date.'; end if;
   update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where teaching_sessions.id in(select (d->>'oldId')::uuid from jsonb_array_elements(schedule->'dates') d);
   result='[]';
   for occurrence in select value from jsonb_array_elements(schedule->'dates') loop
    select * into s from public.teaching_sessions where teaching_sessions.id=(occurrence->>'oldId')::uuid;
    meta=public.teaching_mutate(p_actor,p_audience,'session_create',jsonb_build_object('requestId',gen_random_uuid(),'classId',c.id,'topicId',s.topic_id,'day',occurrence->>'day','slotId',p_data->>'slotId'));
    update public.teaching_sessions set series_id=rid where teaching_sessions.id=(meta->>'sessionId')::uuid;
    result=result||jsonb_build_array(meta||jsonb_build_object('replaces',s.id));
   end loop;
   result=jsonb_build_object('sessions',result);
  else
  schedule=public.teaching_schedule(p_actor,p_audience,c.id,(p_data->>'day')::date,(p_data->>'slotId')::uuid,null,s.id);
  occurrence=schedule->'dates'->0;
  if occurrence is null or occurrence->>'issue' is not null or ((occurrence->>'day')::date+(occurrence->>'startTime')::time) at time zone 'Africa/Johannesburg'<=public.teaching_now() then raise exception 'The replacement time is unavailable: %',occurrence->>'issue'; end if;
  update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where teaching_sessions.id=s.id;
  result=public.teaching_mutate(p_actor,p_audience,'session_create',jsonb_build_object('requestId',gen_random_uuid(),'classId',c.id,'topicId',s.topic_id,'day',p_data->>'day','slotId',p_data->>'slotId'));
  result=result||jsonb_build_object('replaces',s.id);
  end if;
 elsif p_operation='tutor_save' then
  if id is null then
   insert into public.teaching_tutors(name,email) values(trim(p_data->>'name'),lower(trim(p_data->>'email'))) returning teaching_tutors.id into id;
  else
   if length(reason)<5 then raise exception 'Choose a reason for changing tutor access.'; end if;
   update public.teaching_tutors set enabled=(p_data->>'enabled')::boolean where teaching_tutors.id=id;
   if not found then raise exception 'Tutor not found.'; end if;
  end if; result=jsonb_build_object('id',id);
 elsif p_operation='venue_create' then
  insert into public.teaching_venues(name,mode,detail) values(trim(p_data->>'name'),p_data->>'mode',trim(p_data->>'detail')) returning teaching_venues.id into id;result=jsonb_build_object('id',id);
 elsif p_operation='topic_create' then
  if p_data->>'subject' not in ('Mathematics','Natural Sciences','Other academic support','Mathematical Literacy','Physical Sciences','Life Sciences') then raise exception 'Choose an enrollment subject.'; end if;
  insert into public.teaching_topics(grade,subject,title,goal) values(p_data->>'grade',p_data->>'subject',trim(p_data->>'title'),trim(p_data->>'goal')) returning teaching_topics.id into id;result=jsonb_build_object('id',id);
 elsif p_operation='class_create' then
  select * into t from public.teaching_tutors where teaching_tutors.id=(p_data->>'tutorId')::uuid and enabled;
  select * into venue from public.teaching_venues where teaching_venues.id=(p_data->>'venueId')::uuid and active;
  select array_agg(value::smallint) into ds from jsonb_array_elements_text(p_data->'weekdays');
  if t.id is null or venue.id is null or ds is null or not exists(select 1 from public.tuition_programmes where grade=p_data->>'grade' and ds<@weekdays) then raise exception 'Choose an enabled tutor, venue and valid programme days.'; end if;
  if p_data->>'subject' not in ('Mathematics','Natural Sciences','Other academic support','Mathematical Literacy','Physical Sciences','Life Sciences') then raise exception 'Choose an enrollment subject.'; end if;
  insert into public.teaching_classes(name,grade,subject,group_name,season,tutor_id,venue_id,weekdays,starts_at,ends_at)
   values((p_data->>'grade')||' · '||(p_data->>'subject')||' · Group '||(p_data->>'group'),p_data->>'grade',p_data->>'subject',p_data->>'group',(p_data->>'season')::integer,t.id,venue.id,ds,(p_data->>'startTime')::time,(p_data->>'endTime')::time) returning teaching_classes.id into id;
  result=jsonb_build_object('id',id);
 elsif p_operation='class_update' then
  if c.id is null or length(reason)<5 then raise exception 'Choose a class and a reason.'; end if;
  if p_data ? 'tutorId' then
   if not exists(select 1 from public.teaching_tutors where teaching_tutors.id=(p_data->>'tutorId')::uuid and enabled) then raise exception 'Choose an enabled tutor.'; end if;
   if exists(select 1 from public.teaching_sessions ss join public.teaching_sessions other on other.tutor_id=(p_data->>'tutorId')::uuid and other.class_id<>cid and other.status<>'cancelled' and other.starts_at<ss.ends_at and other.ends_at>ss.starts_at where ss.class_id=cid and ss.status='scheduled' and ss.starts_at>public.teaching_now()) then raise exception 'The new tutor has a conflicting future session.'; end if;
   update public.teaching_sessions set tutor_id=(p_data->>'tutorId')::uuid,revision=revision+1 where class_id=cid and status='scheduled' and starts_at>public.teaching_now();
   update public.teaching_classes set tutor_id=(p_data->>'tutorId')::uuid where teaching_classes.id=cid;
  end if;
  if coalesce((p_data->>'archived')::boolean,false) then update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where class_id=cid and status='scheduled' and starts_at>public.teaching_now(); end if;
  if p_data ? 'archived' then update public.teaching_classes set archived=(p_data->>'archived')::boolean where teaching_classes.id=cid;end if;
 elsif p_operation='membership' then
  if c.id is null then raise exception 'Choose a class.'; end if;
  day=(p_data->>'day')::date;
  if day is null or extract(year from day)<>c.season or extract(month from day) not between 2 and 11 then raise exception 'Choose an effective date in this teaching season.'; end if;
  if p_data->>'change'='add' then
   if jsonb_typeof(p_data->'learners')<>'array' or jsonb_array_length(p_data->'learners') not between 1 and 100 then raise exception 'Select between one and 100 learners.'; end if;
   if (select count(*) from public.teaching_memberships where class_id=cid and left_on is null)+jsonb_array_length(p_data->'learners')>100 then raise exception 'A class can have at most 100 current learners.'; end if;
   for item in select value from jsonb_array_elements(p_data->'learners') loop
    select * into a from public.applications where applications.id=(item#>>'{}')::uuid;
    if a.id is null or a.status<>'active' or a.enrollment_state<>'active' or a.grade_level<>c.grade or not(c.subject=any(a.selected_subjects)) then raise exception 'Select active learners enrolled in this grade and subject.'; end if;
    if exists(select 1 from public.teaching_memberships where class_id=cid and application_id=a.id and (left_on is null or left_on>day)) then raise exception 'This learner has an overlapping membership period.'; end if;
    if exists(select 1 from public.teaching_sessions mine join public.teaching_sessions other on other.class_id<>cid and other.status<>'cancelled' and other.starts_at<mine.ends_at and other.ends_at>mine.starts_at join public.teaching_session_roster other_r on other_r.session_id=other.id and other_r.application_id=a.id and other_r.included where mine.class_id=cid and mine.status='scheduled' and (mine.starts_at at time zone 'Africa/Johannesburg')::date>=day) then raise exception 'This learner has an overlapping session in another class.'; end if;
    if exists(select 1 from public.teaching_memberships where class_id=cid and application_id=a.id and joined_on=day) then raise exception 'A membership period already starts on this date. Choose a later return date.'; end if;
    insert into public.teaching_memberships(class_id,application_id,joined_on) values(cid,a.id,day);
    insert into public.teaching_session_roster(session_id,application_id,learner_name,student_number,starting_mark,target_mark)
     select ss.id,a.id,a.learner_name,l.student_number,m.current_mark,m.target_mark from public.teaching_sessions ss join public.learners l on l.application_id=a.id left join public.application_subjects m on m.application_id=a.id and m.subject_name=c.subject
     where ss.class_id=cid and ss.status='scheduled' and (ss.starts_at at time zone 'Africa/Johannesburg')::date>=day on conflict(session_id,application_id) do update set included=true where public.teaching_session_roster.attendance is null;
   end loop;
  elsif p_data->>'change'='remove' then
   if length(reason)<5 then raise exception 'Choose a reason for ending class membership.'; end if;
   update public.teaching_memberships set left_on=day where class_id=cid and application_id=(p_data->>'applicationId')::uuid and left_on is null;
   if not found then raise exception 'Active class membership not found.'; end if;
   update public.teaching_session_roster rr set included=false from public.teaching_sessions ss where rr.session_id=ss.id and ss.class_id=cid and ss.status='scheduled' and rr.application_id=(p_data->>'applicationId')::uuid and (ss.starts_at at time zone 'Africa/Johannesburg')::date>=day and rr.attendance is null;
  else raise exception 'Choose add or remove membership.'; end if;
 elsif p_operation='session_create' then
  day=(p_data->>'day')::date;
  if c.id is null then raise exception 'Choose a class.'; end if;
  if p_data->>'slotId' is not null then select * into slot from public.teaching_slots where teaching_slots.id=(p_data->>'slotId')::uuid and class_id=c.id and active;
  else select * into slot from public.teaching_slots where class_id=c.id and active and weekday=extract(isodow from day)
   and (p_data->>'startTime' is null or starts_at=(p_data->>'startTime')::time) and (p_data->>'endTime' is null or ends_at=(p_data->>'endTime')::time) order by starts_at limit 1; end if;
  if slot.id is null then raise exception 'Choose a saved time slot for this day in the teaching season.'; end if;
  schedule=public.teaching_schedule(p_actor,p_audience,c.id,day,slot.id,nullif(p_data->>'until','')::date);
  if exists(select 1 from jsonb_array_elements(schedule->'dates') x where x->>'issue' is not null) then
   select x->>'issue' into reason from jsonb_array_elements(schedule->'dates') x where x->>'issue' is not null limit 1;
   raise exception 'Cannot schedule: %',reason;
  end if;
  select * into topic from public.teaching_topics where teaching_topics.id=(p_data->>'topicId')::uuid and active;
  select * into venue from public.teaching_venues where teaching_venues.id=c.venue_id and active;
  if topic.id is null or topic.grade<>c.grade or topic.subject<>c.subject then raise exception 'Choose a matching learning topic.'; end if;
  result='[]';
  for occurrence in select value from jsonb_array_elements(schedule->'dates') loop
   day=(occurrence->>'day')::date;start_t=slot.starts_at;end_t=slot.ends_at;
  insert into public.teaching_sessions(class_id,topic_id,topic_title,learning_goal,tutor_id,venue_name,venue_detail,mode,starts_at,ends_at,series_id)
   values(cid,topic.id,topic.title,topic.goal,c.tutor_id,venue.name,venue.detail,venue.mode,(day+start_t) at time zone 'Africa/Johannesburg',(day+end_t) at time zone 'Africa/Johannesburg',rid) returning teaching_sessions.id into sid;
  insert into public.teaching_session_roster(session_id,application_id,learner_name,student_number,starting_mark,target_mark)
   select sid,a0.id,a0.learner_name,l.student_number,m.current_mark,m.target_mark from public.teaching_memberships mm join public.applications a0 on a0.id=mm.application_id join public.learners l on l.application_id=a0.id left join public.application_subjects m on m.application_id=a0.id and m.subject_name=c.subject
   where mm.class_id=cid and mm.joined_on<=day and (mm.left_on is null or mm.left_on>day) and a0.status='active' and a0.enrollment_state='active';
  insert into public.teaching_session_materials(session_id,version_id,learner_visible) select sid,version_id,learner_visible from public.teaching_class_materials where class_id=cid and active;
  first_sid=coalesce(first_sid,sid); result=result||jsonb_build_array(jsonb_build_object('sessionId',sid,'day',day));

  end loop;
  result=jsonb_build_object('sessionId',first_sid,'sessions',result);
 elsif p_operation='attendance' then
  if s.id is null or s.status='cancelled' or s.starts_at>public.teaching_now() then raise exception 'Record attendance only after a non-cancelled session starts.'; end if;
  if (p_data->>'revision')::integer is distinct from s.revision then raise exception 'This register changed. Refresh before saving.'; end if;
  if exists(select 1 from public.teaching_session_roster where session_id=sid and attendance is not null) and length(reason)<5 then raise exception 'Choose a correction reason for a completed register.'; end if;
  select count(*) into n from public.teaching_session_roster where session_id=sid and included;
  if n=0 or jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows')<>n or (select count(distinct value->>'applicationId') from jsonb_array_elements(p_data->'rows'))<>n then raise exception 'Choose attendance for every learner in this session exactly once.'; end if;
  for item in select value from jsonb_array_elements(p_data->'rows') loop
   if not exists(select 1 from public.teaching_session_roster where session_id=sid and application_id=(item->>'applicationId')::uuid and included) or item->>'status' not in ('present','late','absent','excused') or item->>'status' is null then raise exception 'Choose a valid learner and attendance status.'; end if;
   update public.teaching_session_roster set attendance=item->>'status',recorded_by=p_actor,recorded_at=now() where session_id=sid and application_id=(item->>'applicationId')::uuid;
  end loop;
  update public.teaching_sessions set revision=revision+1 where teaching_sessions.id=sid;
 elsif p_operation='session_finish' then
  if s.id is null or (p_data->>'revision')::integer is distinct from s.revision then raise exception 'This session changed. Refresh before saving.'; end if;
  if p_data->>'status'='completed' then
   if s.status<>'scheduled' or s.ends_at>public.teaching_now() or not exists(select 1 from public.teaching_session_roster where session_id=sid and included) or exists(select 1 from public.teaching_session_roster where session_id=sid and included and attendance is null) then raise exception 'Complete an ended session after recording every learner attendance status.'; end if;
   if p_data->>'outcome' not in ('Objective covered','More practice needed','Follow-up planned') or p_data->>'outcome' is null then raise exception 'Choose a teaching outcome.'; end if;
   update public.teaching_sessions set status='completed',outcome=p_data->>'outcome',staff_note=coalesce(p_data->>'staffNote',''),revision=revision+1 where teaching_sessions.id=sid;
  elsif p_data->>'status'='cancelled' then
   if s.status<>'scheduled' or length(reason)<5 then raise exception 'Cancel a scheduled session with a reason.'; end if;
   update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where teaching_sessions.id=sid;
  else raise exception 'Choose complete or cancel.'; end if;
 elsif p_operation='material_prepare' then
  if id is null then raise exception 'A stable upload version ID is required.'; end if;
  if p_data->>'materialId' is not null then
   select * into mat from public.teaching_materials where teaching_materials.id=(p_data->>'materialId')::uuid and not archived;
   if mat.id is null then raise exception 'Material not found.'; end if;
   if p_audience='tutor' and mat.owner_class_id is distinct from c.id then raise exception 'Only the owning class can upload a new version.'; end if;
  else
   insert into public.teaching_materials(title,grade,subject,kind,owner_class_id) values(trim(p_data->>'title'),case when p_audience='tutor' then c.grade else p_data->>'grade' end,case when p_audience='tutor' then c.subject else p_data->>'subject' end,p_data->>'kind',case when p_audience='tutor' then c.id else null end) returning * into mat;
  end if;
  insert into public.teaching_material_versions(id,material_id,version,file_name,storage_path,mime,size_bytes)
   select id,mat.id,coalesce(max(version),0)+1,p_data->>'name',mat.id||'/'||id||case p_data->>'mime' when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_data->>'mime',(p_data->>'size')::integer from public.teaching_material_versions where material_id=mat.id returning * into ver;
  result=to_jsonb(ver);
 elsif p_operation='material_resume' then
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid and finalized_at is null;
  if ver.id is null or ver.file_name is distinct from p_data->>'name' or ver.size_bytes is distinct from (p_data->>'size')::integer or ver.mime is distinct from p_data->>'mime' then raise exception 'Choose the original pending file with its recorded name, size and type.'; end if;
  result=to_jsonb(ver);
 elsif p_operation='material_finalize' then
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid;
  if ver.id is null then raise exception 'Upload not found.'; end if;
  if not exists(select 1 from storage.buckets where storage.buckets.id='teaching-materials' and not public) then raise exception 'The teaching materials bucket must be private.'; end if;
  select metadata into meta from storage.objects where bucket_id='teaching-materials' and name=ver.storage_path;
  if meta is null or coalesce(meta->>'size','')!~'^[0-9]+$' or (meta->>'size')::bigint<>ver.size_bytes or lower(split_part(coalesce(meta->>'mimetype',''),';',1))<>ver.mime then raise exception 'The uploaded file size and type could not be verified.'; end if;
  update public.teaching_material_versions set finalized_at=coalesce(finalized_at,now()) where teaching_material_versions.id=vid returning * into ver;result=to_jsonb(ver);
 elsif p_operation in ('class_material','session_material') then
  if c.id is null then raise exception 'Choose a class.'; end if;
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid and finalized_at is not null;
  select * into mat from public.teaching_materials where teaching_materials.id=ver.material_id;
  if ver.id is null or mat.archived or mat.grade<>c.grade or mat.subject<>c.subject then raise exception 'Choose a verified material for this grade and subject.'; end if;
  if p_operation='class_material' then
   insert into public.teaching_class_materials(class_id,version_id,active) values(cid,vid,coalesce((p_data->>'active')::boolean,true)) on conflict(class_id,version_id) do update set active=excluded.active;
  else
   if s.id is null or s.status<>'scheduled' then raise exception 'Change resources only on a scheduled session.'; end if;
   if p_audience='tutor' and mat.owner_class_id is distinct from c.id and not exists(select 1 from public.teaching_class_materials where class_id=cid and version_id=vid and active) then raise exception 'Select a resource assigned to this class.'; end if;
   insert into public.teaching_session_materials(session_id,version_id,active) values(sid,vid,coalesce((p_data->>'active')::boolean,true)) on conflict(session_id,version_id) do update set active=excluded.active;
  end if;
 else raise exception 'Unknown teaching operation.'; end if;
 insert into public.teaching_events(actor_id,action,class_id,session_id,details) values(p_actor,p_operation,cid,sid,jsonb_build_object('requestId',rid,'reason',reason));
 insert into public.teaching_requests(id,actor_id,audience,operation,payload,result) values(rid,p_actor,p_audience,p_operation,p_data,result);
 return result;
end $$;
revoke all on function public.teaching_mutate(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.teaching_mutate(uuid,text,text,jsonb) to service_role;

create or replace function public.teaching_snapshot(p_actor uuid,p_audience text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors; ids uuid[]; sessions uuid[]; versions uuid[]; result jsonb;
begin
 perform public.teaching_access(p_actor,p_audience);
 if p_audience='tutor' then t=public.tutor_assert(p_actor); end if;
 select coalesce(array_agg(id),'{}') into ids from public.teaching_classes where p_audience='admin' or (tutor_id=t.id and not archived);
 select coalesce(array_agg(id),'{}') into sessions from (select id from public.teaching_sessions where class_id=any(ids) order by starts_at desc limit 1000)x;
 select coalesce(array_agg(distinct version_id),'{}') into versions from(
  select v.id as version_id from public.teaching_material_versions v join public.teaching_materials m on m.id=v.material_id where m.owner_class_id=any(ids) union select version_id from public.teaching_class_materials where class_id=any(ids) and active union select version_id from public.teaching_session_materials where session_id=any(sessions) and active)x;
 result=jsonb_build_object('today',(public.teaching_now() at time zone 'Africa/Johannesburg')::date,'now',public.teaching_now(),'audience',p_audience,'tutorName',t.name,
  'programmes',(select coalesce(jsonb_agg(jsonb_build_object('grade',grade,'weekdays',weekdays) order by grade),'[]') from public.tuition_programmes),
  'closures',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'reason',reason) order by day),'[]') from public.tuition_closures),
  'tutors',case when p_audience='admin' then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'enabled',enabled,'registered',user_id is not null) order by name),'[]') from public.teaching_tutors) else '[]'::jsonb end,
  'venues',case when p_audience='admin' then (select coalesce(jsonb_agg(to_jsonb(v) order by name),'[]') from public.teaching_venues v) else '[]'::jsonb end,
  'topics',(select coalesce(jsonb_agg(to_jsonb(q) order by q.grade,q.subject,q.title),'[]') from public.teaching_topics q where p_audience='admin' or exists(select 1 from public.teaching_classes c where c.id=any(ids) and c.grade=q.grade and c.subject=q.subject)),
  'learners',case when p_audience='admin' then (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.learner_name,'studentNumber',l.student_number,'grade',a.grade_level,'subjects',a.selected_subjects,'learnerEmail',a.learner_email,'studentAccess',coalesce((select enabled from public.student_accounts sa where sa.application_id=a.id),false)) order by a.learner_name),'[]') from public.applications a join public.learners l on l.application_id=a.id where a.status='active' and a.enrollment_state='active') else '[]'::jsonb end,
  'classes',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('tutorName',tt.name,'venueName',v.name,'mode',v.mode) order by c.name),'[]') from public.teaching_classes c join public.teaching_tutors tt on tt.id=c.tutor_id join public.teaching_venues v on v.id=c.venue_id where c.id=any(ids)),
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',mm.id,'class_id',mm.class_id,'application_id',mm.application_id,'joined_on',mm.joined_on,'left_on',mm.left_on,'name',a.learner_name,'studentNumber',l.student_number,'state',a.enrollment_state,'startingMark',m.current_mark,'targetMark',m.target_mark) order by a.learner_name),'[]') from public.teaching_memberships mm join public.teaching_classes c on c.id=mm.class_id join public.applications a on a.id=mm.application_id join public.learners l on l.application_id=a.id left join public.application_subjects m on m.application_id=a.id and m.subject_name=c.subject where mm.class_id=any(ids)),
  'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by starts_at desc),'[]') from public.teaching_sessions s where id=any(sessions)),
  'roster',(select coalesce(jsonb_agg(to_jsonb(r) order by learner_name),'[]') from public.teaching_session_roster r where session_id=any(sessions)),
  'materials',(select coalesce(jsonb_agg(to_jsonb(m) order by created_at desc),'[]') from public.teaching_materials m where p_audience='admin' or exists(select 1 from public.teaching_material_versions v where v.material_id=m.id and v.id=any(versions))),
  'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'material_id',v.material_id,'version',v.version,'file_name',v.file_name,'mime',v.mime,'size_bytes',v.size_bytes,'finalized_at',v.finalized_at) order by v.created_at desc),'[]') from public.teaching_material_versions v where p_audience='admin' or v.id=any(versions)),
  'classMaterials',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.teaching_class_materials m where class_id=any(ids)),
  'sessionMaterials',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.teaching_session_materials m where session_id=any(sessions)),
  'history',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'class_id',e.class_id,'session_id',e.session_id,'created_at',e.created_at,'reason',e.details->>'reason') order by e.created_at desc),'[]') from(select * from public.teaching_events where p_audience='admin' or class_id=any(ids) order by created_at desc limit 200)e),
  'limited',(select count(*)>1000 from public.teaching_sessions where class_id=any(ids)));
 return result||jsonb_build_object('slots',(select coalesce(jsonb_agg(to_jsonb(sl) order by weekday,starts_at),'[]') from public.teaching_slots sl where sl.class_id=any(ids)));
end $$;
create or replace function public.teaching_file(p_actor uuid,p_audience text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v public.teaching_material_versions; t public.teaching_tutors;
begin
 perform public.teaching_access(p_actor,p_audience);
 select * into v from public.teaching_material_versions where id=p_id and finalized_at is not null;
 if v.id is null then raise exception 'Verified teaching file not found.'; end if;
 if p_audience='tutor' then
  t=public.tutor_assert(p_actor);
  if not exists(select 1 from public.teaching_materials m join public.teaching_classes c on c.id=m.owner_class_id where m.id=v.material_id and c.tutor_id=t.id and not c.archived) and not exists(select 1 from public.teaching_class_materials cm join public.teaching_classes c on c.id=cm.class_id where cm.version_id=v.id and cm.active and c.tutor_id=t.id and not c.archived)
   and not exists(select 1 from public.teaching_session_materials sm join public.teaching_sessions s on s.id=sm.session_id join public.teaching_classes c on c.id=s.class_id where sm.version_id=v.id and sm.active and c.tutor_id=t.id and not c.archived) then raise exception 'This teaching file is not assigned to your classes.'; end if;
 end if; return to_jsonb(v);
end $$;

create or replace function public.student_signin_allowed(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_accounts sa join public.applications a on a.id=sa.application_id where sa.email=lower(trim(p_email)) and sa.enabled and a.status='active' and a.enrollment_state='active');
$$;
create or replace function public.student_assert(p_user uuid) returns public.student_accounts language plpgsql stable security definer set search_path='' as $$
declare r public.student_accounts;
begin
 select sa.* into r from public.student_accounts sa join auth.users u on u.id=sa.user_id join public.applications a on a.id=sa.application_id
 where sa.user_id=p_user and sa.email=lower(trim(u.email)) and u.email_confirmed_at is not null and sa.enabled and a.status='active' and a.enrollment_state='active';
 if r.application_id is null then raise exception 'Student access is unavailable. Contact Viva Tutorials.'; end if;return r;
end $$;
create or replace function public.student_bind(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.student_accounts; em text; confirmed timestamptz;
begin
 select lower(trim(email)),email_confirmed_at into em,confirmed from auth.users where id=p_user;
 if confirmed is null then raise exception 'Verify your student email before signing in.'; end if;
 select * into r from public.student_accounts where email=em and enabled for update;
 if r.application_id is null or (r.user_id is not null and r.user_id<>p_user) or not exists(select 1 from public.applications where id=r.application_id and status='active' and enrollment_state='active') then raise exception 'Student access is unavailable.'; end if;
 perform set_config('viva.teaching_actor',p_user::text,true);
 update public.student_accounts set user_id=p_user where application_id=r.application_id;
 return jsonb_build_object('id',p_user,'email',em);
end $$;
create or replace function public.student_scope(p_user uuid,p_audience text,p_application uuid default null) returns uuid language plpgsql stable security definer set search_path='' as $$
declare r public.student_accounts; aid uuid;
begin
 if p_audience='student' then r=public.student_assert(p_user);aid=r.application_id;
  if p_application is not null and p_application<>aid then raise exception 'This learner is not available to your account.'; end if;
 elsif p_audience='parent' then
  perform public.parent_assert(p_user);
  if p_application is null or not exists(select 1 from public.parent_scope(p_user) x where x=p_application) then raise exception 'This learner is not available to your family.'; end if;aid=p_application;
 else raise exception 'Invalid learning access.'; end if;
 if not exists(select 1 from public.applications where id=aid and status='active' and enrollment_state='active') then raise exception 'Learning access is available for active learners. Contact Viva.'; end if;
 return aid;
end $$;
create or replace function public.student_snapshot(p_user uuid,p_audience text,p_application uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare aid uuid; ids uuid[]; ss uuid[]; vv uuid[]; result jsonb;
begin
 aid=public.student_scope(p_user,p_audience,p_application);
 select coalesce(array_agg(distinct class_id),'{}') into ids from public.teaching_memberships where application_id=aid;
 select coalesce(array_agg(id),'{}') into ss from(select s.id from public.teaching_sessions s join public.teaching_session_roster rr on rr.session_id=s.id where rr.application_id=aid and rr.included order by s.starts_at desc limit 1000) q;
 select coalesce(array_agg(distinct version_id),'{}') into vv from(
  select cm.version_id from public.teaching_class_materials cm join public.teaching_classes c on c.id=cm.class_id where cm.active and cm.learner_visible and not c.archived and exists(select 1 from public.teaching_memberships mm where mm.class_id=c.id and mm.application_id=aid and mm.joined_on<=(public.teaching_now() at time zone 'Africa/Johannesburg')::date and (mm.left_on is null or mm.left_on>(public.teaching_now() at time zone 'Africa/Johannesburg')::date))
  union select sm.version_id from public.teaching_session_materials sm join public.teaching_sessions s on s.id=sm.session_id where sm.active and sm.learner_visible and sm.session_id=any(ss) and s.status<>'cancelled') q;
 select jsonb_build_object('today',(public.teaching_now() at time zone 'Africa/Johannesburg')::date,'now',public.teaching_now(),'assisted',p_audience='parent',
 'learner',(select jsonb_build_object('id',a.id,'name',a.learner_name,'grade',a.grade_level,'studentNumber',l.student_number) from public.applications a join public.learners l on l.application_id=a.id where a.id=aid),
 'subjects',(select coalesce(jsonb_agg(jsonb_build_object('name',subject_name,'startingMark',current_mark,'targetMark',target_mark) order by subject_name),'[]') from public.application_subjects where application_id=aid),
 'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'subject',c.subject,'tutorName',t.name,'archived',c.archived,'mode',v.mode) order by c.name),'[]') from public.teaching_classes c join public.teaching_tutors t on t.id=c.tutor_id join public.teaching_venues v on v.id=c.venue_id where c.id=any(ids)),
 'slots',(select coalesce(jsonb_agg(to_jsonb(sl) order by weekday,starts_at),'[]') from public.teaching_slots sl where sl.active and sl.class_id=any(ids) and exists(select 1 from public.teaching_memberships m where m.class_id=sl.class_id and m.application_id=aid and m.joined_on<=(public.teaching_now() at time zone 'Africa/Johannesburg')::date and (m.left_on is null or m.left_on>(public.teaching_now() at time zone 'Africa/Johannesburg')::date))),
 'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'class_id',s.class_id,'topic_title',s.topic_title,'learning_goal',s.learning_goal,'starts_at',s.starts_at,'ends_at',s.ends_at,'mode',s.mode,'venue_name',s.venue_name,'room',case when s.status='scheduled' and s.ends_at>=public.teaching_now() and not c.archived then s.venue_detail else null end,'status',s.status,'attendance',case when s.status='completed' then rr.attendance else null end,'outcome',case when s.status='completed' then s.outcome else null end) order by s.starts_at desc),'[]') from public.teaching_sessions s join public.teaching_classes c on c.id=s.class_id join public.teaching_session_roster rr on rr.session_id=s.id and rr.application_id=aid where s.id=any(ss)),
 'materials',(select coalesce(jsonb_agg(jsonb_build_object('id',mv.id,'title',m.title,'subject',m.subject,'kind',m.kind,'version',mv.version,'file_name',mv.file_name,'mime',mv.mime,'size_bytes',mv.size_bytes) order by m.title),'[]') from public.teaching_material_versions mv join public.teaching_materials m on m.id=mv.material_id where mv.id=any(vv) and mv.finalized_at is not null and not m.archived),
 'attendance',(select jsonb_build_object('completed',count(*),'attended',count(*) filter(where rr.attendance in ('present','late')),'absent',count(*) filter(where rr.attendance='absent'),'excused',count(*) filter(where rr.attendance='excused'),'percentage',round(100.0*count(*) filter(where rr.attendance in ('present','late'))/nullif(count(*) filter(where rr.attendance in ('present','late','absent')),0),1)) from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id where rr.application_id=aid and rr.included and s.status='completed'),
 'limited',(select count(*)>1000 from public.teaching_sessions s join public.teaching_session_roster rr on rr.session_id=s.id where rr.application_id=aid and rr.included)) into result;
 return result;
end $$;
create or replace function public.student_file(p_user uuid,p_audience text,p_id uuid,p_application uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snap jsonb; result jsonb;
begin
 snap=public.student_snapshot(p_user,p_audience,p_application);
 if not exists(select 1 from jsonb_array_elements(snap->'materials') m where m->>'id'=p_id::text) then raise exception 'This resource is not released to your learner account.'; end if;
 select to_jsonb(v) into result from public.teaching_material_versions v where id=p_id and finalized_at is not null;
 return result;
end $$;
revoke all on function public.teaching_seed_slots(),public.teaching_slot_issue(uuid,date,time,time,uuid),public.teaching_schedule(uuid,text,uuid,date,uuid,date,uuid),public.student_signin_allowed(text),public.student_assert(uuid),public.student_bind(uuid),public.student_scope(uuid,text,uuid),public.student_snapshot(uuid,text,uuid),public.student_file(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.teaching_schedule(uuid,text,uuid,date,uuid,date,uuid),public.student_signin_allowed(text),public.student_assert(uuid),public.student_bind(uuid),public.student_snapshot(uuid,text,uuid),public.student_file(uuid,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';

revoke all on function public.teaching_slot_issue_excluding(uuid,date,time,time,uuid[]),public.teaching_series_preview(uuid,text,uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.teaching_series_preview(uuid,text,uuid,date,uuid) to service_role;

create or replace function public.teaching_track_change() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; c uuid; s uuid;
begin
 if tg_op='DELETE' then raise exception 'Teaching history cannot be deleted. Archive or correct the record.'; end if;
 actor=nullif(current_setting('viva.teaching_actor',true),'')::uuid;
 if actor is null then raise exception 'Use an authorized teaching operation so its history is recorded.'; end if;
 if tg_table_name='teaching_classes' then c=new.id;
 elsif tg_table_name='teaching_sessions' then c=new.class_id; s=new.id;
 elsif tg_table_name in ('teaching_memberships','teaching_class_materials','teaching_slots') then c=new.class_id;
 elsif tg_table_name in ('teaching_session_roster','teaching_session_materials') then s=new.session_id;select class_id into c from public.teaching_sessions where id=s;
 end if;
 insert into public.teaching_events(actor_id,action,class_id,session_id,details) values(actor,tg_table_name||':'||lower(tg_op),c,s,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;


do $$ begin if to_regprocedure('public.student_assert(uuid)') is null then raise exception 'Apply the connected teaching/student portal setup before academic setup.';end if;end $$;
-- Use wall time after acquiring locks; transaction-start now() can accept late work after a wait.
create or replace function public.academic_now() returns timestamptz language sql volatile set search_path='' as $$select clock_timestamp()$$;
revoke all on function public.academic_now() from public,anon,authenticated;
-- Academic workflow: additive, audited, private, service-only entry points.
create table if not exists public.academic_periods(
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.teaching_classes(id),
 starts_on date not null,ends_on date not null,method text not null check(method in ('total_marks','equal_weight','weighted')),
 missing_policy text not null default 'exclude' check(missing_policy='exclude'),created_at timestamptz not null default now(),check(ends_on>=starts_on),unique(class_id,starts_on,ends_on)
);
create table if not exists public.academic_tasks(
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.teaching_classes(id),period_id uuid not null references public.academic_periods(id),
 session_id uuid references public.teaching_sessions(id),topic_id uuid not null references public.teaching_topics(id),title text not null check(length(trim(title)) between 2 and 180),
 topic_title text not null,learning_goal text not null,kind text not null check(kind in ('activity','homework','exam')),
 purpose text not null check(purpose in ('diagnostic','formative','summative')),format text not null check(format in ('Quiz','Worksheet','Homework','Project','Test','Practical','Exam')),
 instructions text not null check(length(trim(instructions)) between 5 and 4000),submission_method text not null check(submission_method in ('file','text','both')),
 opens_at timestamptz not null,due_at timestamptz not null,closes_at timestamptz not null,duration_minutes integer check(duration_minutes between 5 and 360),
 max_marks numeric(8,2) not null check(max_marks>0 and max_marks<=10000),counts_average boolean not null,weight numeric(8,2) not null check(weight>0 and weight<=100),
 max_attempts integer not null check(max_attempts between 1 and 3),state text not null default 'draft' check(state in ('draft','assigned','cancelled')),
 memo_released boolean not null default false,created_by uuid not null references auth.users(id),revision integer not null default 0,created_at timestamptz not null default now(),
 check(opens_at<due_at and due_at<=closes_at),check(purpose<>'diagnostic' or not counts_average),check(kind<>'exam' or (max_attempts=1 and due_at=closes_at and duration_minutes is not null)),check(kind<>'activity' or session_id is not null)
);
create table if not exists public.academic_recipients(
 task_id uuid not null references public.academic_tasks(id),application_id uuid not null references public.applications(id),
 learner_name text not null,student_number text not null,starting_mark numeric(5,2),target_mark numeric(5,2),
 extended_closes_at timestamptz,extra_minutes integer not null default 0 check(extra_minutes between 0 and 360),primary key(task_id,application_id)
);
create table if not exists public.academic_resources(
 task_id uuid not null references public.academic_tasks(id),version_id uuid not null references public.teaching_material_versions(id),
 role text not null check(role in ('instructions','memo')),primary key(task_id,version_id)
);
create table if not exists public.academic_attempts(
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.academic_tasks(id),application_id uuid not null references public.applications(id),
 attempt integer not null check(attempt between 1 and 3),state text not null default 'draft' check(state in ('draft','submitted','returned')),
 answer text not null default '' check(length(answer)<=6000),started_at timestamptz not null,submitted_at timestamptz,receipt uuid unique,
 revision integer not null default 0,return_reason text,late boolean not null default false,unique(task_id,application_id,attempt),
 foreign key(task_id,application_id) references public.academic_recipients(task_id,application_id)
);
create table if not exists public.academic_uploads(
 id uuid primary key,attempt_id uuid not null references public.academic_attempts(id),file_name text not null check(length(file_name) between 1 and 200),
 storage_path text not null unique,mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),size_bytes integer not null check(size_bytes between 1 and 10485760),
 finalized_at timestamptz,discarded boolean not null default false,created_at timestamptz not null default now()
);
create table if not exists public.academic_grades(
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.academic_tasks(id),application_id uuid not null references public.applications(id),
 attempt_id uuid not null references public.academic_attempts(id),revision integer not null,score numeric(8,2) not null check(score>=0),
 feedback text not null check(length(trim(feedback)) between 2 and 4000),staff_note text not null default '' check(length(staff_note)<=2000),
 state text not null default 'draft' check(state in ('draft','review','published','rejected')),reason text not null default '',
 marked_by uuid not null references auth.users(id),created_at timestamptz not null default now(),published_by uuid references auth.users(id),published_at timestamptz,
 unique(task_id,application_id,revision),foreign key(task_id,application_id) references public.academic_recipients(task_id,application_id)
);
create table if not exists public.academic_reports(
 id uuid primary key default gen_random_uuid(),period_id uuid not null references public.academic_periods(id),application_id uuid not null references public.applications(id),
 content jsonb not null,reason text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index if not exists academic_tasks_class on public.academic_tasks(class_id,created_at);
create index if not exists academic_recipient_learner on public.academic_recipients(application_id,task_id);
create index if not exists academic_attempt_learner on public.academic_attempts(application_id,task_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('academic-submissions','academic-submissions',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.academic_track() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;cid uuid;tid uuid;aid uuid;
begin
 if tg_op='DELETE' then raise exception 'Academic history cannot be deleted.';end if;
 actor=nullif(current_setting('viva.teaching_actor',true),'')::uuid;
 if actor is null then raise exception 'Use an authorized academic operation.';end if;
 if tg_table_name in ('academic_periods','academic_tasks') then cid=new.class_id;
 elsif tg_table_name='academic_reports' then select class_id into cid from public.academic_periods where id=new.period_id;
 elsif tg_table_name='academic_uploads' then select task_id into tid from public.academic_attempts where id=new.attempt_id;
 else tid=new.task_id;end if;
 if tid is not null then select class_id into cid from public.academic_tasks where id=tid;end if;
 -- Contents/answers/marks are retained in protected rows, not copied to the
 -- general class teaching history which is broader than per-learner marking.
 insert into public.teaching_events(actor_id,action,class_id,details) values(actor,tg_table_name||':'||lower(tg_op),cid,jsonb_build_object('recordId',coalesce(to_jsonb(new)->>'id',tid::text),'requestId',current_setting('viva.academic_request',true)));
 return new;
end $$;
do $$ declare n text;begin
 foreach n in array array['academic_periods','academic_tasks','academic_recipients','academic_resources','academic_attempts','academic_uploads','academic_grades','academic_reports'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant all on public.%I to service_role',n);
 execute format('drop trigger if exists academic_track on public.%I',n);
 execute format('create trigger academic_track after insert or update or delete on public.%I for each row execute function public.academic_track()',n);
 end loop;
 -- Frozen reports may only be appended.
 execute 'drop trigger if exists academic_report_immutable on public.academic_reports';
 execute 'create trigger academic_report_immutable before update or delete on public.academic_reports for each row execute function public.teaching_history_immutable()';
end $$;
create or replace function public.academic_learner(p_user uuid,p_audience text,p_application uuid default null) returns uuid language plpgsql stable security definer set search_path='' as $$
declare r public.student_accounts;
begin
 if p_audience='student' then r=public.student_assert(p_user);if p_application is not null and p_application<>r.application_id then raise exception 'This learner is not available to your account.';end if;return r.application_id;
 elsif p_audience='parent' then perform public.parent_assert(p_user);if p_application is null or not exists(select 1 from public.parent_scope(p_user) x where x=p_application) then raise exception 'This learner is not available to your family.';end if;return p_application;
 else raise exception 'Invalid learner audience.';end if;
end $$;
create or replace function public.academic_deadline(p_attempt uuid) returns timestamptz language sql stable security definer set search_path='' as $$
 select least(coalesce(r.extended_closes_at,t.closes_at),case when t.duration_minutes is null then 'infinity'::timestamptz else a.started_at+make_interval(mins=>t.duration_minutes+r.extra_minutes) end)
 from public.academic_attempts a join public.academic_tasks t on t.id=a.task_id join public.academic_recipients r on r.task_id=a.task_id and r.application_id=a.application_id where a.id=p_attempt;
$$;
create or replace function public.academic_progress(p_application uuid,p_period uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.academic_periods;average numeric; n integer;expected integer;diagnostics jsonb; marks jsonb;result jsonb;target numeric;starting numeric;subject text;classname text;
begin
 select * into p from public.academic_periods where id=p_period;
 select c.subject,c.name into subject,classname from public.teaching_classes c where c.id=p.class_id;
 select current_mark,target_mark into starting,target from public.application_subjects where application_id=p_application and subject_name=subject;
 select count(*) into expected from public.academic_tasks t join public.academic_recipients r on r.task_id=t.id where r.application_id=p_application and t.period_id=p.id and t.state='assigned' and t.counts_average;
 select count(*),case p.method when 'total_marks' then 100*sum(g.score)/nullif(sum(t.max_marks),0) when 'equal_weight' then avg(100*g.score/t.max_marks) else sum(100*g.score/t.max_marks*t.weight)/nullif(sum(t.weight),0) end into n,average
 from public.academic_tasks t join lateral(select score from public.academic_grades x where x.task_id=t.id and x.application_id=p_application and x.state='published' order by revision desc limit 1)g on true
 where t.period_id=p.id and t.state='assigned' and t.counts_average and t.purpose<>'diagnostic';
 select coalesce(jsonb_agg(jsonb_build_object('taskId',t.id,'title',t.title,'score',g.score,'maxMarks',t.max_marks,'percentage',round(100*g.score/t.max_marks,2),'feedback',g.feedback,'weight',t.weight,'countsAverage',t.counts_average,'purpose',t.purpose,'publishedAt',g.published_at,'revision',g.revision) order by g.published_at,t.id),'[]') into marks
 from public.academic_tasks t join lateral(select score,feedback,published_at,revision from public.academic_grades x where x.task_id=t.id and x.application_id=p_application and x.state='published' order by revision desc limit 1)g on true where t.period_id=p.id;
 select coalesce(jsonb_agg(m),'[]') into diagnostics from jsonb_array_elements(marks) m where m->>'purpose'='diagnostic';
 result=jsonb_build_object('periodId',p.id,'className',classname,'subject',subject,'startsOn',p.starts_on,'endsOn',p.ends_on,'method',p.method,'missingPolicy',p.missing_policy,'average',round(average,2),'assessmentCount',n,'expectedCount',expected,'missingCount',expected-n,'startingMark',starting,'targetMark',target,'gapToTarget',case when average is null or target is null then null else round(target-average,2) end,'diagnostics',diagnostics,'marks',marks,'calculatedAt',public.academic_now());
 return result||jsonb_build_object('fingerprint',md5((result-'calculatedAt')::text));
end $$;

create or replace function public.academic_mutate(p_actor uuid,p_audience text,p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare rid uuid=(p_data->>'requestId')::uuid;cid uuid=(p_data->>'classId')::uuid;tid uuid=(p_data->>'taskId')::uuid;aid uuid;attempt_id uuid=(p_data->>'attemptId')::uuid;
 t public.academic_tasks;c public.teaching_classes;p public.academic_periods;tp public.teaching_topics;r public.academic_recipients;att public.academic_attempts;up public.academic_uploads;g public.academic_grades;req public.teaching_requests;
 result jsonb='{}';item jsonb;vid uuid;meta jsonb;latest integer;reason text=trim(coalesce(p_data->>'reason',''));v_open timestamptz;v_due timestamptz;v_close timestamptz;counted integer;
begin
 if rid is null then raise exception 'A stable request ID is required.';end if;
 if p_audience in ('admin','tutor') then perform public.teaching_access(p_actor,p_audience,cid);
 elsif p_audience='student' then aid=public.academic_learner(p_actor,'student');
 else raise exception 'Parents have read-only academic access.';end if;
 perform 1 from public.teaching_settings where singleton for update;
 select * into req from public.teaching_requests where id=rid;
 if req.id is not null then if req.actor_id<>p_actor or req.audience<>p_audience or req.operation<>'academic:'||p_operation or req.payload<>p_data then raise exception 'This request ID was already used for another operation.';end if;return req.result;end if;
 perform set_config('viva.teaching_actor',p_actor::text,true);perform set_config('viva.academic_request',rid::text,true);
 if p_audience='student' and p_operation not in ('attempt_start','draft_save','upload_prepare','upload_finalize','upload_resume','upload_discard','submit') then raise exception 'This academic operation is for staff.';end if;
 if p_operation in ('period_create','grade_publish','grade_reject','report_publish','memo_release') and p_audience<>'admin' then raise exception 'Administrator review is required.';end if;
 if attempt_id is not null then select * into att from public.academic_attempts where id=attempt_id for update;
  if att.id is null then raise exception 'Attempt not found.';end if;if tid is not null and tid<>att.task_id then raise exception 'Attempt and task do not match.';end if;tid=att.task_id;
 end if;
 if tid is not null then
  select * into t from public.academic_tasks where id=tid for update;if t.id is null then raise exception 'Task not found.';end if;
  if cid is not null and cid<>t.class_id then raise exception 'Task and class do not match.';end if;cid=t.class_id;
  if p_audience='student' then
   select * into r from public.academic_recipients where task_id=tid and application_id=aid;
   if r.application_id is null or t.state<>'assigned' or (att.id is not null and att.application_id<>aid) then raise exception 'This work is not assigned to your learner account.';end if;
  else perform public.teaching_access(p_actor,p_audience,cid);end if;
 end if;
 if cid is not null then select * into c from public.teaching_classes where id=cid;
  if c.id is null then raise exception 'Class not found.';end if;
  if c.archived and p_operation not in ('grade_save','grade_review','grade_publish','grade_reject','report_publish') then raise exception 'This class is archived.';end if;
 end if;
 if p_operation='period_create' then
  if c.id is null or (p_data->>'startsOn')::date<(make_date(c.season,2,1)) or (p_data->>'endsOn')::date>make_date(c.season,11,30) then raise exception 'Choose a reporting period within this class teaching season.';end if;
  insert into public.academic_periods(class_id,starts_on,ends_on,method) values(cid,(p_data->>'startsOn')::date,(p_data->>'endsOn')::date,p_data->>'method') returning to_jsonb(academic_periods.*) into result;
 elsif p_operation='task_create' then
  if c.id is null then raise exception 'Choose an assigned class.';end if;
  select * into p from public.academic_periods where id=(p_data->>'periodId')::uuid and class_id=cid;
  select * into tp from public.teaching_topics where id=(p_data->>'topicId')::uuid and grade=c.grade and subject=c.subject and active;
  if p.id is null or tp.id is null then raise exception 'Choose this class reporting period and learning topic.';end if;
  if p_data->>'sessionId' is not null and not exists(select 1 from public.teaching_sessions where id=(p_data->>'sessionId')::uuid and class_id=cid and status<>'cancelled') then raise exception 'Choose a non-cancelled session in this class.';end if;
  v_open=(p_data->>'opensAt')::timestamp at time zone 'Africa/Johannesburg';v_due=(p_data->>'dueAt')::timestamp at time zone 'Africa/Johannesburg';v_close=(p_data->>'closesAt')::timestamp at time zone 'Africa/Johannesburg';
  if (v_open at time zone 'Africa/Johannesburg')::date<p.starts_on or (v_close at time zone 'Africa/Johannesburg')::date>p.ends_on then raise exception 'Choose availability inside the selected reporting period.';end if;
  insert into public.academic_tasks(class_id,period_id,session_id,topic_id,title,topic_title,learning_goal,kind,purpose,format,instructions,submission_method,opens_at,due_at,closes_at,duration_minutes,max_marks,counts_average,weight,max_attempts,created_by)
   values(cid,p.id,(p_data->>'sessionId')::uuid,tp.id,coalesce(nullif(trim(p_data->>'title'),''),tp.title||' · '||(p_data->>'format')),tp.title,tp.goal,p_data->>'kind',p_data->>'purpose',p_data->>'format',trim(p_data->>'instructions'),p_data->>'submissionMethod',v_open,v_due,v_close,nullif(p_data->>'durationMinutes','')::integer,(p_data->>'maxMarks')::numeric,(p_data->>'countsAverage')::boolean,(p_data->>'weight')::numeric,(p_data->>'maxAttempts')::integer,p_actor) returning id into tid;
  if jsonb_array_length(coalesce(p_data->'resources','[]'))>20 then raise exception 'Attach at most 20 resource versions.';end if;
  for item in select value from jsonb_array_elements(coalesce(p_data->'resources','[]')) loop
   vid=(item->>'versionId')::uuid;
   if not exists(select 1 from public.teaching_material_versions v join public.teaching_materials m on m.id=v.material_id where v.id=vid and v.finalized_at is not null and not m.archived and m.grade=c.grade and m.subject=c.subject and (p_audience='admin' or m.owner_class_id=c.id or exists(select 1 from public.teaching_class_materials cm where cm.class_id=c.id and cm.version_id=v.id and cm.active))) then raise exception 'Choose verified resources belonging to this class.';end if;
   if (item->>'role'='memo' or p_data->>'kind'='exam') and (
    exists(select 1 from public.teaching_class_materials cm where cm.version_id=vid and cm.active and cm.learner_visible)
    or exists(select 1 from public.teaching_session_materials sm where sm.version_id=vid and sm.active and sm.learner_visible)
    or exists(select 1 from public.academic_resources ar join public.academic_tasks oldtask on oldtask.id=ar.task_id where ar.version_id=vid and oldtask.state='assigned' and oldtask.opens_at<=public.academic_now() and (ar.role='instructions' or oldtask.memo_released))
   ) then raise exception 'Choose a private, unreleased resource version for assessment papers or memoranda.';end if;
   insert into public.academic_resources values(tid,vid,item->>'role');
  end loop;
  result=jsonb_build_object('taskId',tid);
 elsif p_operation='task_assign' then
  if t.state<>'draft' or (p_data->>'revision')::integer is distinct from t.revision then raise exception 'Assign an unchanged draft task.';end if;
  if jsonb_typeof(p_data->'learners')<>'array' or jsonb_array_length(p_data->'learners') not between 1 and 100 then raise exception 'Choose between one and 100 eligible learners.';end if;
  for item in select value from jsonb_array_elements(p_data->'learners') loop
   if not exists(select 1 from public.teaching_memberships m join public.applications a on a.id=m.application_id where m.class_id=cid and m.application_id=(item#>>'{}')::uuid and m.joined_on<=(t.opens_at at time zone 'Africa/Johannesburg')::date and (m.left_on is null or m.left_on>(t.opens_at at time zone 'Africa/Johannesburg')::date) and a.status='active' and a.enrollment_state='active') then raise exception 'Choose active learners who belong to this class when the work opens.';end if;
   insert into public.academic_recipients(task_id,application_id,learner_name,student_number,starting_mark,target_mark) select tid,a.id,a.learner_name,l.student_number,s.current_mark,s.target_mark from public.applications a join public.learners l on l.application_id=a.id left join public.application_subjects s on s.application_id=a.id and s.subject_name=c.subject where a.id=(item#>>'{}')::uuid;
  end loop;
  update public.academic_tasks set state='assigned',revision=revision+1 where id=tid;
 elsif p_operation='task_cancel' then
  if length(reason)<5 or t.state='cancelled' or exists(select 1 from public.academic_attempts where task_id=tid and state<>'draft') then raise exception 'Cancel unused work with a reason; submitted work must retain its marking workflow.';end if;
  update public.academic_tasks set state='cancelled',revision=revision+1 where id=tid;
 elsif p_operation='extension' then
  if t.state<>'assigned' or t.memo_released or length(reason)<5 then raise exception 'Extend assigned work with a reason before releasing its memorandum.';end if;
  if t.kind='exam' and exists(select 1 from public.academic_resources ar where ar.task_id=tid and (exists(select 1 from public.teaching_class_materials cm where cm.version_id=ar.version_id and cm.active and cm.learner_visible) or exists(select 1 from public.teaching_session_materials sm where sm.version_id=ar.version_id and sm.active and sm.learner_visible))) then raise exception 'This assessment paper is already shared outside its task. Create a new private assessment instead of reopening it.';end if;
  v_close=(p_data->>'closesAt')::timestamp at time zone 'Africa/Johannesburg';
  select * into r from public.academic_recipients where task_id=tid and application_id=(p_data->>'applicationId')::uuid;
  if r.application_id is null or coalesce((p_data->>'extraMinutes')::integer,0)<r.extra_minutes or v_close<=coalesce(r.extended_closes_at,t.closes_at) or (v_close at time zone 'Africa/Johannesburg')::date>make_date(c.season,11,30) then raise exception 'Choose a later closing time within the teaching season for an assigned learner.';end if;
  update public.academic_recipients set extended_closes_at=v_close,extra_minutes=coalesce((p_data->>'extraMinutes')::integer,0) where task_id=tid and application_id=r.application_id;
 elsif p_operation='memo_release' then
  if t.state<>'assigned' or length(reason)<5 or exists(select 1 from public.academic_recipients where task_id=tid and coalesce(extended_closes_at,t.closes_at)>public.academic_now()) then raise exception 'Release a memorandum only after every learner closing time, with a reason.';end if;
  update public.academic_tasks set memo_released=true,revision=revision+1 where id=tid;
 elsif p_operation='attempt_start' then
  if p_audience<>'student' then raise exception 'Only the independently signed-in student can start work.';end if;
  if public.academic_now()<t.opens_at or public.academic_now()>=coalesce(r.extended_closes_at,t.closes_at) then raise exception 'This work is not open for submission.';end if;
  select * into att from public.academic_attempts where task_id=tid and application_id=aid order by attempt desc limit 1;
  if att.state='draft' then result=jsonb_build_object('attemptId',att.id);
  else
   if att.id is not null and (att.state<>'returned' or att.attempt>=t.max_attempts) then raise exception 'This work is already submitted or no further attempts are allowed.';end if;
   insert into public.academic_attempts(task_id,application_id,attempt,started_at) values(tid,aid,coalesce(att.attempt,0)+1,public.academic_now()) returning id into attempt_id;result=jsonb_build_object('attemptId',attempt_id);
  end if;
 elsif p_operation in ('draft_save','upload_prepare','upload_finalize','upload_resume','upload_discard','submit') then
  if p_audience<>'student' or att.id is null or att.state<>'draft' then raise exception 'Only the learner can change their unsubmitted draft.';end if;
  if public.academic_now()<t.opens_at or public.academic_now()>=public.academic_deadline(att.id) then raise exception 'The submission deadline has passed. Saved drafts remain recorded; request an authorized extension.';end if;
  if p_operation='upload_discard' then
   update public.academic_uploads set discarded=true where id=(p_data->>'id')::uuid and academic_uploads.attempt_id=att.id;
   if not found then raise exception 'Upload not found.';end if;
  elsif p_operation='upload_resume' then
   select * into up from public.academic_uploads where id=(p_data->>'id')::uuid and academic_uploads.attempt_id=att.id and not discarded and finalized_at is null;
   if up.id is null or up.file_name is distinct from p_data->>'name' or up.size_bytes is distinct from (p_data->>'size')::integer or up.mime is distinct from p_data->>'mime' then raise exception 'Choose the original pending file with its recorded name, size and type.';end if;result=to_jsonb(up);
  elsif p_operation in ('draft_save','submit') then
   if (p_data->>'revision')::integer is distinct from att.revision then raise exception 'This draft changed. Refresh before saving.';end if;
   if p_operation='submit' then
    if t.submission_method in ('text','both') and length(trim(coalesce(p_data->>'answer',att.answer)))=0 then raise exception 'Add your answer before submitting.';end if;
    if t.submission_method in ('file','both') and not exists(select 1 from public.academic_uploads where academic_uploads.attempt_id=att.id and finalized_at is not null and not discarded) then raise exception 'Upload and verify a required file before submitting.';end if;
    if exists(select 1 from public.academic_uploads where academic_uploads.attempt_id=att.id and finalized_at is null and not discarded) then raise exception 'Verify every pending upload before submitting.';end if;
   end if;
   update public.academic_attempts set answer=coalesce(p_data->>'answer',answer),revision=revision+1,state=case when p_operation='submit' then 'submitted' else 'draft' end,
    submitted_at=case when p_operation='submit' then public.academic_now() else null end,receipt=case when p_operation='submit' then gen_random_uuid() else null end,late=p_operation='submit' and public.academic_now()>t.due_at where id=att.id returning * into att;
   result=jsonb_build_object('attemptId',att.id,'revision',att.revision,'receipt',att.receipt,'submittedAt',att.submitted_at);
  elsif p_operation='upload_prepare' then
   if t.submission_method='text' or (select count(*) from public.academic_uploads where academic_uploads.attempt_id=att.id and not discarded)>=3 then raise exception 'Choose a file-enabled task with fewer than three uploads.';end if;
   insert into public.academic_uploads(id,attempt_id,file_name,storage_path,mime,size_bytes) values((p_data->>'id')::uuid,att.id,p_data->>'name',att.id||'/'||(p_data->>'id')||case p_data->>'mime' when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_data->>'mime',(p_data->>'size')::integer) returning * into up;result=to_jsonb(up);
  else
   select * into up from public.academic_uploads where id=(p_data->>'id')::uuid and academic_uploads.attempt_id=att.id and not discarded;
   if up.id is null then raise exception 'Upload not found in this draft.';end if;
   if not exists(select 1 from storage.buckets where id='academic-submissions' and not public) then raise exception 'Submission storage must remain private.';end if;
   select metadata into meta from storage.objects where bucket_id='academic-submissions' and name=up.storage_path;
   if meta is null or coalesce(meta->>'size','')!~'^[0-9]+$' or (meta->>'size')::bigint<>up.size_bytes or lower(split_part(coalesce(meta->>'mimetype',''),';',1))<>up.mime then raise exception 'The uploaded file size and type could not be verified.';end if;
   update public.academic_uploads set finalized_at=coalesce(finalized_at,public.academic_now()) where id=up.id;result=jsonb_build_object('id',up.id);
  end if;
 elsif p_operation='attempt_return' then
  if att.id is null or att.state<>'submitted' or t.kind='exam' or att.attempt>=t.max_attempts or length(reason)<5 or exists(select 1 from public.academic_grades where academic_grades.attempt_id=att.id) then raise exception 'Return unmarked homework with a reason only when another attempt is permitted.';end if;
  update public.academic_attempts set state='returned',return_reason=reason,revision=revision+1 where id=att.id;
 elsif p_operation='grade_save' then
  if att.id is null or att.state<>'submitted' then raise exception 'Select a confirmed learner submission before marking.';end if;
  select coalesce(max(revision),0) into latest from public.academic_grades where task_id=tid and application_id=att.application_id;
  if latest is distinct from (p_data->>'revision')::integer then raise exception 'Marking changed. Refresh before saving.';end if;
  if latest>0 and length(reason)<5 then raise exception 'Give a reason for revising a mark.';end if;
  if (p_data->>'score')::numeric>t.max_marks then raise exception 'The score exceeds the maximum marks.';end if;
  insert into public.academic_grades(task_id,application_id,attempt_id,revision,score,feedback,staff_note,reason,marked_by) values(tid,att.application_id,att.id,latest+1,(p_data->>'score')::numeric,trim(p_data->>'feedback'),coalesce(p_data->>'staffNote',''),reason,p_actor) returning id into vid;result=jsonb_build_object('gradeId',vid);
 elsif p_operation in ('grade_review','grade_publish','grade_reject') then
  select * into g from public.academic_grades where id=(p_data->>'gradeId')::uuid and task_id=tid for update;
  if g.id is null or g.revision<>(select max(revision) from public.academic_grades where task_id=tid and application_id=g.application_id) then raise exception 'Select the latest mark revision.';end if;
  if p_operation='grade_review' then
   if g.state<>'draft' then raise exception 'Submit a draft mark for review.';end if;update public.academic_grades set state='review' where id=g.id;
  elsif p_operation='grade_publish' then
   if g.state<>'review' then raise exception 'Only reviewed marks can be published.';end if;update public.academic_grades set state='published',published_by=p_actor,published_at=public.academic_now() where id=g.id;
  else
   if g.state<>'review' or length(reason)<5 then raise exception 'Return a pending review with a reason.';end if;update public.academic_grades set state='rejected',reason=reason where id=g.id;
  end if;
 elsif p_operation='report_publish' then
  select * into p from public.academic_periods where id=(p_data->>'periodId')::uuid and class_id=cid;
  aid=(p_data->>'applicationId')::uuid;
  if p.id is null or length(reason)<5 or not exists(select 1 from public.academic_recipients ar join public.academic_tasks task on task.id=ar.task_id where ar.application_id=aid and task.period_id=p.id) then raise exception 'Choose a learner with work in this period and a publication reason.';end if;
  result=public.academic_progress(aid,p.id);
  if p_data->>'fingerprint' is distinct from result->>'fingerprint' then raise exception 'Progress changed. Refresh and review the current calculation before publishing.';end if;
  result=result||(select jsonb_build_object('learnerName',a.learner_name,'studentNumber',l.student_number,'className',c.name) from public.applications a join public.learners l on l.application_id=a.id where a.id=aid);
  insert into public.academic_reports(period_id,application_id,content,reason,created_by) values(p.id,aid,result,reason,p_actor) returning id into vid;result=jsonb_build_object('reportId',vid);
 else raise exception 'Unknown academic operation.';end if;
 insert into public.teaching_events(actor_id,action,class_id,details) values(p_actor,'academic:'||p_operation,cid,jsonb_build_object('requestId',rid,'taskId',tid,'attemptId',attempt_id,'reason',reason));
 insert into public.teaching_requests values(rid,p_actor,p_audience,'academic:'||p_operation,p_data,result,now());return result;
end $$;

create or replace function public.academic_snapshot(p_actor uuid,p_audience text,p_application uuid default null,p_task uuid default null,p_class uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare aid uuid;ids uuid[];tasks uuid[];attempts uuid[];staff boolean=p_audience in ('admin','tutor');result jsonb;
begin
 if staff then
  perform public.teaching_access(p_actor,p_audience);
  select coalesce(array_agg(id),'{}') into ids from public.teaching_classes where (p_class is null or id=p_class) and (p_audience='admin' or (tutor_id=(select id from public.tutor_assert(p_actor)) and not archived));
 else aid=public.academic_learner(p_actor,p_audience,p_application);
  select coalesce(array_agg(distinct t.class_id),'{}') into ids from public.academic_recipients r join public.academic_tasks t on t.id=r.task_id where r.application_id=aid;
 end if;
 select coalesce(array_agg(t.id),'{}') into tasks from public.academic_tasks t where t.class_id=any(ids) and (staff or (t.state<>'draft' and exists(select 1 from public.academic_recipients r where r.task_id=t.id and r.application_id=aid)));
 if cardinality(tasks)>1000 then raise exception 'Contact Viva for an extended academic record export; more than 1000 tasks are available.';end if;
 select coalesce(array_agg(a.id),'{}') into attempts from public.academic_attempts a where a.task_id=any(tasks) and (case when staff then a.state<>'draft' else a.application_id=aid end);
 result=jsonb_build_object('now',public.academic_now(),'audience',p_audience,
 'periods',(select coalesce(jsonb_agg(to_jsonb(p) order by starts_on),'[]') from public.academic_periods p where class_id=any(ids)),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(t)-'created_by'||jsonb_build_object('class_archived',(select archived from public.teaching_classes where id=t.class_id))||case when not staff and public.academic_now()<t.opens_at then jsonb_build_object('instructions','This work has not opened yet.') else '{}'::jsonb end order by t.created_at desc),'[]') from public.academic_tasks t where id=any(tasks)),
 'recipients',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.academic_recipients r where task_id=any(tasks) and (staff or application_id=aid)),
 'attempts',(select coalesce(jsonb_agg((to_jsonb(a)-'answer')||jsonb_build_object('answer',case when a.task_id=p_task then a.answer else null end,'deadline',public.academic_deadline(a.id)) order by attempt desc),'[]') from public.academic_attempts a where id=any(attempts)),
 'uploads',(select coalesce(jsonb_agg(to_jsonb(u)-'storage_path'),'[]') from public.academic_uploads u where attempt_id=any(attempts) and not discarded),
 'grades',case when staff then (select coalesce(jsonb_agg(to_jsonb(g) order by revision desc),'[]') from public.academic_grades g where task_id=any(tasks))
  else (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'task_id',g.task_id,'application_id',g.application_id,'attempt_id',g.attempt_id,'revision',g.revision,'score',g.score,'feedback',g.feedback,'state',g.state,'published_at',g.published_at) order by g.published_at desc,g.revision desc),'[]') from public.academic_grades g where g.task_id=any(tasks) and g.application_id=aid and g.state='published') end,
 'resources',(select coalesce(jsonb_agg(jsonb_build_object('task_id',r.task_id,'version_id',r.version_id,'role',r.role,'name',v.file_name,'mime',v.mime,'version',v.version)),'[]') from public.academic_resources r join public.academic_tasks t on t.id=r.task_id join public.teaching_material_versions v on v.id=r.version_id where r.task_id=any(tasks) and (staff or (t.state='assigned' and public.academic_now()>=t.opens_at and (r.role='instructions' or t.memo_released)))),
 'progress',case when staff then (select coalesce(jsonb_agg(public.academic_progress(q.application_id,q.period_id)||jsonb_build_object('applicationId',q.application_id,'learnerName',q.learner_name)),'[]') from(select distinct r.application_id,t.period_id,r.learner_name from public.academic_recipients r join public.academic_tasks t on t.id=r.task_id where t.class_id=any(ids))q) else (select coalesce(jsonb_agg(public.academic_progress(aid,p.id)),'[]') from public.academic_periods p where class_id=any(ids)) end,
 'reports',(select coalesce(jsonb_agg(to_jsonb(r)-'created_by' order by r.created_at desc),'[]') from public.academic_reports r join public.academic_periods p on p.id=r.period_id where p.class_id=any(ids) and (staff or r.application_id=aid)));
 return result;
end $$;
create or replace function public.academic_file(p_actor uuid,p_audience text,p_id uuid,p_kind text,p_application uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snap jsonb;result jsonb;
begin
 snap=public.academic_snapshot(p_actor,p_audience,p_application);
 if p_kind='resource' then
  if not exists(select 1 from jsonb_array_elements(snap->'resources') x where x->>'version_id'=p_id::text) then raise exception 'This academic resource is not released to your account.';end if;
  select to_jsonb(v)||jsonb_build_object('bucket','teaching-materials') into result from public.teaching_material_versions v where id=p_id and finalized_at is not null;
 elsif p_kind='submission' then
  if not exists(select 1 from jsonb_array_elements(snap->'uploads') x where x->>'id'=p_id::text and x->>'finalized_at' is not null and x->>'discarded'='false') then raise exception 'This submission file is not available to your account.';end if;
  select to_jsonb(u)||jsonb_build_object('bucket','academic-submissions') into result from public.academic_uploads u where id=p_id and finalized_at is not null;
 else raise exception 'Unknown academic file kind.';end if;
 if result is null then raise exception 'Verified academic file not found.';end if;return result;
end $$;
create or replace function public.academic_report(p_actor uuid,p_audience text,p_id uuid,p_application uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.academic_reports;cid uuid;aid uuid;
begin
 select * into r from public.academic_reports where id=p_id;
 if r.id is null then raise exception 'Report not found.';end if;
 if p_audience in ('admin','tutor') then select class_id into cid from public.academic_periods where id=r.period_id;perform public.teaching_access(p_actor,p_audience,cid);
 else aid=public.academic_learner(p_actor,p_audience,p_application);if aid<>r.application_id then raise exception 'This report does not belong to your learner account.';end if;end if;
 return jsonb_build_object('id',r.id,'content',r.content,'created_at',r.created_at);
end $$;
revoke all on function public.academic_track(),public.academic_learner(uuid,text,uuid),public.academic_deadline(uuid),public.academic_progress(uuid,uuid),public.academic_mutate(uuid,text,text,jsonb),public.academic_snapshot(uuid,text,uuid,uuid,uuid),public.academic_file(uuid,text,uuid,text,uuid),public.academic_report(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.academic_mutate(uuid,text,text,jsonb),public.academic_snapshot(uuid,text,uuid,uuid,uuid),public.academic_file(uuid,text,uuid,text,uuid),public.academic_report(uuid,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';

-- Protect alternate class/session download paths as well as the academic API.
create or replace function public.academic_guard_release() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active and new.learner_visible and exists(
  select 1 from public.academic_resources ar join public.academic_tasks task on task.id=ar.task_id
  where ar.version_id=new.version_id and task.state<>'cancelled' and (
   (ar.role='memo' and not task.memo_released)
   or (ar.role='instructions' and task.kind='exam' and greatest(task.closes_at,coalesce((select max(r.extended_closes_at) from public.academic_recipients r where r.task_id=task.id),task.closes_at))>public.academic_now())
  )
 ) then raise exception 'This version is protected by an academic task. Share it through the task and release memoranda through admin after closing.';end if;
 return new;
end $$;
drop trigger if exists academic_release_guard on public.teaching_class_materials;
create trigger academic_release_guard before insert or update on public.teaching_class_materials for each row execute function public.academic_guard_release();
drop trigger if exists academic_release_guard on public.teaching_session_materials;
create trigger academic_release_guard before insert or update on public.teaching_session_materials for each row execute function public.academic_guard_release();
revoke all on function public.academic_guard_release() from public,anon,authenticated;

-- END TEACHING FOUNDATION


-- BEGIN SYSTEM OVERSIGHT
-- Admin oversight. No existing business records or automation defaults are reset.
do $setup$
begin
 if to_regprocedure('public.academic_snapshot(uuid,text,uuid,uuid,uuid)') is null
    and to_regclass('public.academic_tasks') is null then
   raise exception 'Apply the connected teaching and academic setup before system oversight.';
 end if;
 if to_regprocedure('public.accounting_integrity()') is null then
   raise exception 'Apply the accounting setup before system oversight.';
 end if;
end;
$setup$;

create table if not exists public.system_preferences (
 singleton boolean primary key default true check(singleton),
 revision integer not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
insert into public.system_preferences(singleton) values(true) on conflict do nothing;
create table if not exists public.system_requests (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 operation text not null, input jsonb not null, result jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.system_backup_reviews (
 id uuid primary key default gen_random_uuid(), checked_on date not null,
 method text not null check(method in ('provider_review','export_review','restore_test')),
 note text not null check(length(trim(note)) between 5 and 1000),
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.system_job_events (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 source text not null check(source in ('scheduled','manual')),
 started_at timestamptz not null default now(), finished_at timestamptz,
 state text not null default 'running' check(state in ('running','completed','failed')),
 result jsonb not null default '{}'
);
create table if not exists public.system_email_tests (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 requested_at timestamptz not null default now(), finished_at timestamptz,
 state text not null default 'pending' check(state in ('pending','accepted','failed','uncertain')),
 provider_id text
);
create index if not exists system_job_recent on public.system_job_events(started_at desc);
create index if not exists system_email_recent on public.system_email_tests(requested_at desc);
do $permissions$
declare t text;
begin
 foreach t in array array['system_preferences','system_requests','system_backup_reviews','system_job_events','system_email_tests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end;
$permissions$;

create or replace function public.system_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_owner boolean; v_snapshot jsonb;
begin
 perform public.admin_assert(p_actor);
 select finance_role='owner' into v_owner from public.admin_users where user_id=p_actor;
 select jsonb_build_object(
  'now',now(),'today',public.tuition_today(),'role',(select finance_role from public.admin_users where user_id=p_actor),
  'revision',(select revision from public.system_preferences where singleton),
  'accounting',(select jsonb_build_object('books_start',s.books_start,'closed_through',s.closed_through,'automation_enabled',s.automation_enabled,'auto_send',s.auto_send,'scheduler_valid',exists(select 1 from public.admin_users a where a.user_id=s.scheduler_actor and a.enabled and a.finance_role='owner')) from public.accounting_settings s where singleton),
  'programmes',coalesce((select jsonb_agg(p order by grade) from public.tuition_programmes p),'[]'::jsonb),
  'closures',coalesce((select jsonb_agg(c order by day) from public.tuition_closures c),'[]'::jsonb),
  'admins',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'email',u.email,'enabled',a.enabled,'role',a.finance_role) order by u.email) from public.admin_users a join auth.users u on u.id=a.user_id),'[]'::jsonb) else '[]'::jsonb end,
  'candidates',case when v_owner then coalesce((select jsonb_agg(c) from(select u.id,u.email from auth.users u where nullif(to_jsonb(u)->>'email_confirmed_at','') is not null and u.email is not null and not exists(select 1 from public.admin_users a where a.user_id=u.id) order by u.email limit 100)c),'[]'::jsonb) else '[]'::jsonb end,
  'candidatesLimited',case when v_owner then (select count(*)>100 from auth.users u where nullif(to_jsonb(u)->>'email_confirmed_at','') is not null and u.email is not null and not exists(select 1 from public.admin_users a where a.user_id=u.id)) else false end,
  'backups',coalesce((select jsonb_agg(b order by b.created_at desc) from(select id,checked_on,method,note,created_at from public.system_backup_reviews order by created_at desc limit 20)b),'[]'::jsonb),
  'jobs',coalesce((select jsonb_agg(j order by j.started_at desc) from(select id,source,started_at,finished_at,state,result from public.system_job_events order by started_at desc limit 20)j),'[]'::jsonb),
  'scheduledJob',(select to_jsonb(j) from(select id,source,started_at,finished_at,state,result from public.system_job_events where source='scheduled' order by started_at desc limit 1)j),
  'emailTests',coalesce((select jsonb_agg(e order by e.requested_at desc) from(select id,requested_at,finished_at,state from public.system_email_tests order by requested_at desc limit 10)e),'[]'::jsonb),
  'issues',coalesce((select jsonb_agg(x) from (
   select a.id::text id,'report_metadata'::text kind,a.application_number||' · '||a.learner_name label,'Report card metadata missing'::text context,'Applications'::text target
    from public.applications a where a.status='pending_review' and not exists(select 1 from public.learner_documents d where d.application_id=a.id and d.storage_path=a.report_card_path)
   union all select d.id::text,'report_file',a.application_number||' · '||d.file_name,'Report card Storage object missing','Applications'
    from public.learner_documents d join public.applications a on a.id=d.application_id where not exists(select 1 from storage.objects o where o.bucket_id='learner-documents' and o.name=d.storage_path)
   union all select v.id::text,'material_file',m.title||' · '||v.file_name,case when v.finalized_at is null then 'Teaching upload unfinished for over an hour' else 'Teaching material Storage object missing' end,'Materials'
    from public.teaching_material_versions v join public.teaching_materials m on m.id=v.material_id where (v.finalized_at is null and v.created_at<now()-interval '1 hour') or (v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='teaching-materials' and o.name=v.storage_path))
   union all select v.id::text,'assessment_file',a.application_number||' · '||v.file_name,case when v.finalized_at is null then 'Assessment upload unfinished for over an hour' else 'Assessment response Storage object missing' end,'Assessments'
    from public.academic_uploads v join public.academic_attempts t on t.id=v.attempt_id join public.applications a on a.id=t.application_id where not v.discarded and ((v.finalized_at is null and v.created_at<now()-interval '1 hour') or (v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='academic-submissions' and o.name=v.storage_path)))
   union all select v.id::text,'expense_file',v.name,case when v.finalized_at is null then 'Expense evidence unfinished for over an hour' else 'Expense evidence Storage object missing' end,'Finance'
    from public.accounting_attachments v where (v.finalized_at is null and v.created_at<now()-interval '1 hour') or (v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='accounting-documents' and o.name=v.storage_path))
   order by kind,label limit 100
  )x),'[]'::jsonb),
  'health',jsonb_build_object(
   'modules',jsonb_build_object(
    'Enrollment',to_regprocedure('public.submit_enrollment(jsonb)') is not null and to_regprocedure('public.finalize_enrollment_document(uuid,text)') is not null,
    'Admin',to_regprocedure('public.admin_snapshot(uuid)') is not null,
    'Parents',to_regprocedure('public.parent_snapshot(uuid)') is not null,
    'Students',to_regprocedure('public.student_snapshot(uuid,text,uuid)') is not null,
    'Teaching',to_regprocedure('public.teaching_snapshot(uuid,text)') is not null,
    'Academics',to_regprocedure('public.academic_snapshot(uuid,text,uuid,uuid,uuid)') is not null
   ),
   'integrity',public.accounting_integrity(),
   'queuedMessages',(select count(*) from public.tuition_messages where state='pending'),
   'failedMessages',(select count(*) from public.tuition_messages where state='failed'),
   'ambiguousMessages',(select count(*) from public.tuition_messages where state='sending' and claimed_at<now()-interval '15 minutes'),
   'enrollmentEmailErrors',(select count(*) from public.applications where nullif(email_last_error,'') is not null),
   'missingReportRecords',(select count(*) from public.applications a where a.status='pending_review' and not exists(select 1 from public.learner_documents d where d.application_id=a.id and d.storage_path=a.report_card_path)),
   'missingStoredFiles',(select count(*) from public.learner_documents d where not exists(select 1 from storage.objects o where o.bucket_id='learner-documents' and o.name=d.storage_path))
       +(select count(*) from public.teaching_material_versions v where v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='teaching-materials' and o.name=v.storage_path))
       +(select count(*) from public.academic_uploads v where v.finalized_at is not null and not v.discarded and not exists(select 1 from storage.objects o where o.bucket_id='academic-submissions' and o.name=v.storage_path))
       +(select count(*) from public.accounting_attachments v where v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='accounting-documents' and o.name=v.storage_path)),
   'unfinishedUploads',(select count(*) from public.teaching_material_versions where finalized_at is null and created_at<now()-interval '1 hour')
       +(select count(*) from public.academic_uploads where finalized_at is null and not discarded and created_at<now()-interval '1 hour')
       +(select count(*) from public.accounting_attachments where finalized_at is null and created_at<now()-interval '1 hour'),
   'unfinishedSessions',(select count(*) from public.teaching_sessions where status='scheduled' and ends_at<now()),
   'marksInReview',(select count(*) from public.academic_grades where state='review'),
   'pendingApplications',(select count(*) from public.applications where status='pending_review'),
   'access',jsonb_build_object('admins',(select count(*) from public.admin_users where enabled),'parents',(select count(*) from public.parent_accounts where enabled),'tutors',(select count(*) from public.teaching_tutors where enabled),'students',(select count(*) from public.student_accounts where enabled))
  )
 ) into v_snapshot;
 return v_snapshot;
end;
$function$;

create or replace function public.system_mutate(p_actor uuid,p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare preferences public.system_preferences; prior public.system_requests; request_id uuid; target uuid; v_day date; why text; result jsonb; v_enabled boolean; role text;
begin
 perform public.accounting_assert(p_actor,true);
 request_id=(p_data->>'requestId')::uuid;
 if request_id is null then raise exception 'A change request identifier is required.';end if;
 -- Same lock order as accounting: staff permissions, then finance settings.
 perform pg_advisory_xact_lock(71228001);
 perform 1 from public.accounting_settings where singleton for update;
 perform public.accounting_assert(p_actor,true);
 select * into preferences from public.system_preferences where singleton for update;
 select * into prior from public.system_requests where id=request_id;
 if prior.id is not null then
  if prior.actor_id<>p_actor or prior.operation<>p_operation or prior.input<>p_data then raise exception 'This request identifier belongs to a different change.';end if;
  return prior.result;
 end if;
 if (p_data->>'revision')::integer is distinct from preferences.revision then raise exception 'Settings changed since you opened them. Refresh and review your choices again.';end if;
 why=trim(coalesce(p_data->>'reason',''));
 if length(why) not between 5 and 1000 then raise exception 'Choose a reason or record a review note.';end if;
 if p_operation='admin_access' then
  if nullif(p_data->>'userId','') is not null then target=(p_data->>'userId')::uuid;
  else
   if (select count(*) from auth.users u where lower(trim(u.email))=lower(trim(p_data->>'userEmail')) and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null)<>1 then raise exception 'The verified staff email must identify exactly one Auth account.';end if;
   select id into target from auth.users u where lower(trim(u.email))=lower(trim(p_data->>'userEmail')) and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null;
  end if;
  v_enabled=(p_data->>'enabled')::boolean; role=p_data->>'role';
  if target is null or v_enabled is null or role is null or role not in ('owner','bookkeeper','viewer') then raise exception 'Choose a staff account, role and access state.';end if;
  if target=p_actor then raise exception 'Another owner must change your own permissions.';end if;
  if v_enabled and not exists(select 1 from auth.users u where u.id=target and u.email is not null and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null) then raise exception 'Create and verify the staff Auth account before granting access.';end if;
  if not v_enabled and not exists(select 1 from public.admin_users where user_id=target) then raise exception 'This account has no admin access to disable.';end if;
  if exists(select 1 from public.admin_users where user_id=target and enabled and finance_role='owner') and (not v_enabled or role<>'owner') and (select count(*) from public.admin_users where enabled and finance_role='owner')<=1 then raise exception 'Keep at least one enabled owner.';end if;
  if (not v_enabled or role<>'owner') and exists(select 1 from public.accounting_settings where singleton and automation_enabled and scheduler_actor=target) then raise exception 'Save automation as another owner, or disable automation, before changing the scheduled-run owner.';end if;
  insert into public.admin_users(user_id,enabled,finance_role) values(target,v_enabled,role) on conflict(user_id) do update set enabled=excluded.enabled,finance_role=excluded.finance_role;
  perform public.accounting_audit(p_actor,'system_admin_access',jsonb_build_object('targetEmail',(select email from auth.users where id=target),'enabled',v_enabled,'role',role,'reason',why,'description','Admin access and finance permissions reviewed'));
 elsif p_operation='automation' then
  if jsonb_typeof(p_data->'automationEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'autoSend') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedAutomationEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedAutoSend') is distinct from 'boolean' then raise exception 'Choose valid automation settings.';end if;
  if exists(select 1 from public.accounting_settings where singleton and (automation_enabled is distinct from (p_data->>'expectedAutomationEnabled')::boolean or auto_send is distinct from (p_data->>'expectedAutoSend')::boolean)) then raise exception 'Automation changed since you opened it. Refresh and review again.';end if;
  perform public.accounting_mutate(p_actor,'settings',p_data||jsonb_build_object('booksStart',(select books_start from public.accounting_settings where singleton)));
 elsif p_operation in ('closure_add','closure_remove') then
  perform pg_advisory_xact_lock(71228003);
  v_day=(p_data->>'day')::date;
  if v_day is null or v_day<public.tuition_today() or extract(month from v_day) not between 2 and 11 then raise exception 'Choose today or a future teaching date in February to November.';end if;
  if p_operation='closure_add' then
   if exists(select 1 from public.teaching_sessions where (starts_at at time zone 'Africa/Johannesburg')::date=v_day and status<>'cancelled') then raise exception 'Cancel or reschedule existing sessions on this date before adding a closure.';end if;
   if exists(select 1 from public.tuition_closures c where c.day=v_day) then raise exception 'This date is already a closure.';end if;
   insert into public.tuition_closures values(v_day,why);
  else
   delete from public.tuition_closures c where c.day=v_day;
   if not found then raise exception 'This closure is no longer present. Refresh the calendar.';end if;
  end if;
  perform public.accounting_audit(p_actor,'system_'||p_operation,jsonb_build_object('day',v_day,'reason',why,'description',case when p_operation='closure_add' then 'Teaching closure added; issued invoices retain their original calendar' else 'Future closure removed; historical records retained' end));
 elsif p_operation='backup_review' then
  v_day=(p_data->>'checkedOn')::date;
  if v_day is null or v_day>public.tuition_today() then raise exception 'Choose today or an earlier backup review date.';end if;
  if p_data->>'method' is null or p_data->>'method' not in ('provider_review','export_review','restore_test') then raise exception 'Choose what was actually checked.';end if;
  insert into public.system_backup_reviews(checked_on,method,note,actor_id) values(v_day,p_data->>'method',why,p_actor);
  perform public.accounting_audit(p_actor,'system_backup_review',jsonb_build_object('day',v_day,'method',p_data->>'method','reason',why,'description','Owner-reported backup review recorded; no backup or restore was run by the application'));
 else raise exception 'Unknown system settings action.';
 end if;
 update public.system_preferences set revision=revision+1,updated_at=now(),updated_by=p_actor where singleton returning jsonb_build_object('revision',revision,'success',true) into result;
 insert into public.system_requests values(request_id,p_actor,p_operation,p_data,result,now());
 return result;
end;
$function$;

create or replace function public.system_job_record(p_actor uuid,p_id uuid,p_source text,p_state text,p_result jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $function$
begin
 perform public.accounting_assert(p_actor,true);
 if p_source is null or p_source not in ('scheduled','manual') or p_state is null or p_state not in ('running','completed','failed') or pg_column_size(p_result)>16384 then raise exception 'Invalid run record.';end if;
 if p_state='running' then
  insert into public.system_job_events(id,actor_id,source) values(p_id,p_actor,p_source) on conflict do nothing;
 else
  update public.system_job_events set state=p_state,finished_at=now(),result=p_result where id=p_id and actor_id=p_actor and source=p_source and state='running';
 end if;
end;
$function$;

create or replace function public.system_email_test_claim(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare test public.system_email_tests; destination text;
begin
 perform public.accounting_assert(p_actor,true);
 perform pg_advisory_xact_lock(71228002);
 select * into test from public.system_email_tests where id=p_id;
 if test.id is not null then
  if test.actor_id<>p_actor then raise exception 'This email check belongs to another owner.';end if;
  return jsonb_build_object('send',false,'id',test.id,'state',test.state);
 end if;
 select email into destination from auth.users u where u.id=p_actor and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null;
 if destination is null then raise exception 'Verify your admin email before requesting a test.';end if;
 if exists(select 1 from public.system_email_tests where requested_at>now()-interval '1 minute') then raise exception 'Wait one minute before requesting another test email.';end if;
 insert into public.system_email_tests(id,actor_id) values(p_id,p_actor);
 perform public.accounting_audit(p_actor,'system_email_test',jsonb_build_object('description','A single provider test was requested for the signed-in owner email','requestId',p_id));
 return jsonb_build_object('send',true,'id',p_id,'to',destination,'state','pending');
end;
$function$;
create or replace function public.system_email_test_finish(p_actor uuid,p_id uuid,p_state text,p_provider_id text default null) returns void
language plpgsql security definer set search_path='' as $function$
begin
 perform public.accounting_assert(p_actor,true);
 if p_state is null or p_state not in ('accepted','failed','uncertain') then raise exception 'Invalid email check result.';end if;
 update public.system_email_tests set state=p_state,provider_id=left(p_provider_id,120),finished_at=now() where id=p_id and actor_id=p_actor and state='pending';
end;
$function$;
revoke all on function public.system_snapshot(uuid),public.system_mutate(uuid,text,jsonb),public.system_job_record(uuid,uuid,text,text,jsonb),public.system_email_test_claim(uuid,uuid),public.system_email_test_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.system_snapshot(uuid),public.system_mutate(uuid,text,jsonb),public.system_job_record(uuid,uuid,text,text,jsonb),public.system_email_test_claim(uuid,uuid),public.system_email_test_finish(uuid,uuid,text,text) to service_role;

-- Serialize new/rescheduled sessions with closure changes; never rewrite existing history.
create or replace function public.system_guard_session_calendar() returns trigger
language plpgsql security definer set search_path='' as $calendar$
begin
 if new.status='scheduled' and (tg_op='INSERT' or new.starts_at is distinct from old.starts_at or new.status is distinct from old.status) then
  perform pg_advisory_xact_lock(71228003);
  if exists(select 1 from public.tuition_closures c where c.day=(new.starts_at at time zone 'Africa/Johannesburg')::date) then raise exception 'This date is a teaching closure. Choose another session date.';end if;
 end if;
 return new;
end;
$calendar$;
drop trigger if exists system_session_calendar_guard on public.teaching_sessions;
create trigger system_session_calendar_guard before insert or update of starts_at,status on public.teaching_sessions for each row execute function public.system_guard_session_calendar();
revoke all on function public.system_guard_session_calendar() from public,anon,authenticated;

-- END SYSTEM OVERSIGHT

-- BEGIN HIGH PRIORITY RECOVERY
-- Recover missed tuition billing without changing issued invoices or billing seasons.
do $$ begin
 if to_regprocedure('public.accounting_run_schedule(uuid)') is null then raise exception 'Apply the accounting setup before billing recovery.'; end if;
end $$;

create or replace function public.accounting_billing_candidates(p_actor uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare result jsonb;
begin
 perform public.accounting_assert(p_actor,true);
 if p_month is null or extract(day from p_month)<>1 or p_month>date_trunc('month',public.tuition_today())::date or p_month<date_trunc('month',(select books_start from public.accounting_settings where singleton))::date then raise exception 'Choose a current or past month within the books.';end if;
 if extract(month from p_month) not between 2 and 11 then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(q order by q.id),'[]') into result from (
  select a.id,a.learner_name,a.application_number,a.grade_level,a.monthly_fee,
   greatest(p_month,a.tuition_start_date,coalesce((a.activated_at at time zone 'Africa/Johannesburg')::date,a.tuition_start_date)) as starts_on,
   least((p_month+interval '1 month - 1 day')::date,coalesce(a.billing_end_date,'infinity'::date)) as ends_on,
   days.earning_dates,days.total_days,
   round(a.monthly_fee*100*cardinality(days.earning_dates)/nullif(days.total_days,0))::bigint as amount_cents
  from public.applications a join public.tuition_programmes p on p.grade=a.grade_level
  cross join lateral (
   select count(*)::integer total_days,coalesce(array_agg(d::date order by d) filter(where d::date>=greatest(a.tuition_start_date,coalesce((a.activated_at at time zone 'Africa/Johannesburg')::date,a.tuition_start_date)) and d::date<=coalesce(a.billing_end_date,'infinity'::date)),'{}'::date[]) earning_dates
   from generate_series(p_month::timestamp,(p_month+interval '1 month - 1 day')::timestamp,interval '1 day') d
   where extract(isodow from d)::integer=any(p.weekdays) and not exists(select 1 from public.tuition_closures c where c.day=d::date)
  ) days
  where a.status='active' and (a.enrollment_state='active' or (a.enrollment_state='withdrawn' and a.billing_end_date>=p_month))
   and a.tuition_start_date<=(p_month+interval '1 month - 1 day')::date and a.tuition_start_date<=public.tuition_today()
   and (a.billing_end_date is null or a.billing_end_date>=p_month)
   and a.monthly_fee>0 and cardinality(days.earning_dates)>0
   and not exists(select 1 from public.tuition_invoices i where i.application_id=a.id and i.billing_month=p_month)
 ) q;
 return result;
end;
$function$;

create or replace function public.accounting_recover_billing(p_actor uuid,p_month date,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare req public.accounting_requests; candidates jsonb; item jsonb; ids uuid[];result jsonb;rid uuid=(p_data->>'requestId')::uuid;n integer=0;
begin
 perform public.accounting_assert(p_actor,true);
 perform 1 from public.accounting_settings where singleton for update;
 perform public.accounting_assert(p_actor,true);
 if rid is null then raise exception 'A stable recovery request is required.';end if;
 select * into req from public.accounting_requests where id=rid;
 if req.id is not null then
  if req.actor_id<>p_actor or req.action<>'recover_billing' or req.payload<>p_data||jsonb_build_object('month',p_month) then raise exception 'This request was used for different details.';end if;return req.result;
 end if;
 candidates=public.accounting_billing_candidates(p_actor,p_month);
 if p_data->>'fingerprint' is distinct from md5(candidates::text) then raise exception 'Billing candidates changed. Refresh and review again.';end if;
 if coalesce((p_data->>'reviewed')::boolean,false) is not true or length(trim(coalesce(p_data->>'reason',''))) not between 5 and 1000 then raise exception 'Review the service dates and charges and record a reason.';end if;
 if jsonb_typeof(p_data->'applications') is distinct from 'array' or jsonb_array_length(p_data->'applications') not between 1 and 100 then raise exception 'Choose one to 100 reviewed learners.';end if;
 select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(p_data->'applications') x;
 if cardinality(ids)<>jsonb_array_length(p_data->'applications') or exists(select 1 from unnest(ids) x where not exists(select 1 from jsonb_array_elements(candidates) c where (c->>'id')::uuid=x)) then raise exception 'Choose distinct eligible learners from the current preview.';end if;
 for item in select value from jsonb_array_elements(candidates) where (value->>'id')::uuid=any(ids) loop
  perform public.admin_create_invoice(p_actor,(item->>'id')::uuid,p_month,(item->>'starts_on')::date);n=n+1;
 end loop;
 result=jsonb_build_object('success',true,'count',n);
 perform public.accounting_audit(p_actor,'billing_recovery',jsonb_build_object('month',p_month,'count',n,'reason',p_data->>'reason','applications',ids));
 insert into public.accounting_requests(id,actor_id,action,payload,result) values(rid,p_actor,'recover_billing',p_data||jsonb_build_object('month',p_month),result);
 return result;
end;
$function$;

create or replace function public.accounting_recover_current(p_actor uuid) returns integer
language plpgsql security definer set search_path='' as $function$
declare item jsonb;n integer=0;m date=date_trunc('month',public.tuition_today())::date;
begin
 perform public.accounting_assert(p_actor,true);
 perform 1 from public.accounting_settings where singleton for update;
 for item in select value from jsonb_array_elements(public.accounting_billing_candidates(p_actor,m)) loop
  perform public.admin_create_invoice(p_actor,(item->>'id')::uuid,m,(item->>'starts_on')::date);n=n+1;
 end loop;
 if n>0 then perform public.accounting_audit(p_actor,'billing_current_recovery',jsonb_build_object('month',m,'count',n));end if;
 return n;
end;
$function$;

create or replace function public.accounting_run_schedule(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_run public.accounting_runs;v_today date=public.tuition_today();v_result jsonb='{}';v_month date;v_recognised bigint;v_error text;v_recovered integer;
begin
 perform public.accounting_assert(p_actor,true);
 perform 1 from public.accounting_settings where singleton for update;
 perform public.accounting_assert(p_actor,true);
 select * into v_run from public.accounting_runs where run_on=v_today;
 -- Recheck coverage even after today's run, e.g. a learner activated later today.
 if v_run.state='completed' then
  v_recovered=public.accounting_recover_current(p_actor);
  return v_run.result||jsonb_build_object('alreadyCompleted',true,'currentMonthRecovered',v_recovered);
 end if;
 begin
  v_recovered=public.accounting_recover_current(p_actor);
  v_recognised=public.accounting_recognise(p_actor,v_today-1);
  v_result=jsonb_build_object('recognisedInvoices',v_recognised,'date',v_today,'currentMonthRecovered',v_recovered);
  if extract(day from v_today)>=25 then
   v_month=date_trunc('month',v_today+interval '1 month')::date;
   v_result=v_result||jsonb_build_object('billing',public.admin_mutate(p_actor,'generate_month',jsonb_build_object('month',v_month)));
  end if;
  if extract(day from v_today)>=3 then v_result=v_result||jsonb_build_object('reminders',public.admin_mutate(p_actor,'queue_reminders','{}'));end if;
 exception when others then
  v_result=jsonb_build_object('date',v_today,'rolledBack',true);
  v_error=case when sqlstate='P0001' then left(sqlerrm,300) else 'The accounting run failed. Review configuration before retrying.' end;
 end;
 insert into public.accounting_runs(run_on,state,result,last_error,actor_id) values(v_today,case when v_error is null then 'completed' else 'failed' end,v_result,v_error,p_actor)
 on conflict(run_on) do update set state=excluded.state,result=excluded.result,last_error=excluded.last_error,attempts=public.accounting_runs.attempts+1,finished_at=now();
 perform public.accounting_audit(p_actor,'accounting_run',v_result||jsonb_build_object('error',v_error));
 return v_result||jsonb_build_object('success',v_error is null,'error',v_error);
end;
$function$;
revoke all on function public.accounting_billing_candidates(uuid,date),public.accounting_recover_billing(uuid,date,jsonb),public.accounting_recover_current(uuid) from public,anon,authenticated;
grant execute on function public.accounting_billing_candidates(uuid,date),public.accounting_recover_billing(uuid,date,jsonb) to service_role;

create or replace function public.accounting_billing_preview(p_actor uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb;begin c=public.accounting_billing_candidates(p_actor,p_month);return jsonb_build_object('candidates',c,'fingerprint',md5(c::text));end $$;
revoke all on function public.accounting_billing_preview(uuid,date) from public,anon,authenticated;
grant execute on function public.accounting_billing_preview(uuid,date) to service_role;

-- Durable paid-PDF orders, verified events, delivery claims and clearing-account postings.
do $$ begin
 if to_regprocedure('public.accounting_post(uuid,text,date,text,text,uuid,jsonb,uuid)') is null then raise exception 'Apply accounting setup before paid-PDF recovery.';end if;
end $$;
create table if not exists public.payfast_products(title text primary key,amount_cents integer not null check(amount_cents>0),file_name text not null);
insert into public.payfast_products values('Analytical Geometry Practice',29900,'02. Analytical Geometry Practice Questions.pdf'),('Finance Practice Questions',39900,'04. Finance Practice Questions.pdf') on conflict do nothing;
do $$ begin
 if exists(select 1 from public.payfast_products where (title='Analytical Geometry Practice' and (amount_cents<>29900 or file_name<>'02. Analytical Geometry Practice Questions.pdf')) or (title='Finance Practice Questions' and (amount_cents<>39900 or file_name<>'04. Finance Practice Questions.pdf'))) then raise exception 'Paid catalogue configuration differs from the deployed products. Review the catalogue before installing.';end if;
end $$;
create table if not exists public.payfast_settings(singleton boolean primary key default true check(singleton),actor_id uuid references auth.users(id));
insert into public.payfast_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.payfast_orders(
 id uuid primary key,product text not null references public.payfast_products(title),amount_cents integer not null,file_name text not null,
 first_name text not null,last_name text not null,email text not null,phone text not null,
 created_at timestamptz not null default now(),paid_at timestamptz,legacy boolean not null default false,
 check(length(first_name) between 1 and 100 and length(last_name) between 1 and 100 and length(phone) between 3 and 40 and length(email)<=254),check(email=lower(trim(email)))
);
create table if not exists public.payfast_payments(
 id uuid primary key default gen_random_uuid(),provider_id text not null unique check(length(provider_id) between 1 and 120),order_id uuid not null references public.payfast_orders(id),
 gross_cents integer not null check(gross_cents>0),fee_cents integer check(fee_cents between 0 and gross_cents),
 verified_on date not null default public.tuition_today(),created_at timestamptz not null default now(),
 review_required boolean not null default false,review_reason text,journal_id uuid unique references public.accounting_journals(id),posting_error text,
 fingerprint text not null
);
create table if not exists public.payfast_deliveries(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.payfast_orders(id),kind text not null check(kind in ('customer','admin')),
 recipient text,state text not null default 'pending' check(state in ('pending','sending','accepted','failed','uncertain')),
 claimed_at timestamptz,claim_id uuid,finished_at timestamptz,provider_id text,attempts integer not null default 0,last_error text,
 unique(order_id,kind)
);
create table if not exists public.payfast_delivery_events(
 id uuid primary key default gen_random_uuid(),delivery_id uuid not null references public.payfast_deliveries(id),claim_id uuid,state text not null,created_at timestamptz not null default now(),provider_id text
);
create table if not exists public.payfast_settlements(
 id uuid primary key,reference text not null,amount_cents bigint not null check(amount_cents>0),posted_on date not null,journal_id uuid not null unique references public.accounting_journals(id),actor_id uuid not null references auth.users(id),reversed_at timestamptz,reversal_journal_id uuid unique references public.accounting_journals(id)
);
create unique index if not exists payfast_settlement_reference on public.payfast_settlements(reference) where reversed_at is null;
create index if not exists payfast_payments_order on public.payfast_payments(order_id);
create index if not exists payfast_pending_deliveries on public.payfast_deliveries(state,claimed_at);
create index if not exists payfast_delivery_history on public.payfast_delivery_events(delivery_id,created_at);
do $$ declare t text;begin
 foreach t in array array['payfast_products','payfast_settings','payfast_orders','payfast_payments','payfast_deliveries','payfast_delivery_events','payfast_settlements'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 if exists(select 1 from public.accounting_accounts where (code='1020' and (name<>'PayFast clearing' or kind<>'asset' or not control_account)) or (code='4110' and (name<>'Study-material sales' or kind<>'income')) or (code='5060' and (name<>'PayFast processing fees' or kind<>'expense'))) then raise exception 'Chart accounts 1020, 4110 or 5060 already have another purpose. Review account mapping before installing.';end if;
end $$;
insert into public.accounting_accounts(code,name,kind,control_account) values('1020','PayFast clearing','asset',true),('4110','Study-material sales','income',false),('5060','PayFast processing fees','expense',false) on conflict do nothing;

create or replace function public.payfast_order_create(p_id uuid,p_product text,p_first text,p_last text,p_email text,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare o public.payfast_orders;p public.payfast_products;
begin
 if p_id is null or p_email is null or p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid checkout details are required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('pdf-order:'||p_id,0));
 select * into p from public.payfast_products where title=p_product;
 if p.title is null then raise exception 'This paid material is unavailable.';end if;
 select * into o from public.payfast_orders where id=p_id;
 if o.id is not null then
  if (o.product,o.first_name,o.last_name,o.email,o.phone) is distinct from (p_product,p_first,p_last,lower(trim(p_email)),p_phone) then raise exception 'This checkout request belongs to different details.';end if;
  if o.paid_at is not null then raise exception 'This order is already paid. Check your delivery before buying again.';end if;
 else
  insert into public.payfast_orders(id,product,amount_cents,file_name,first_name,last_name,email,phone) values(p_id,p.title,p.amount_cents,p.file_name,p_first,p_last,lower(trim(p_email)),p_phone) returning * into o;
 end if;
 return to_jsonb(o);
end;
$function$;

create or replace function public.payfast_post_payment(p_actor uuid,p_id uuid,p_reviewed boolean default false,p_reason text default null,p_fee integer default null) returns uuid
language plpgsql security definer set search_path='' as $function$
declare e public.payfast_payments;o public.payfast_orders;j uuid;lines jsonb;credit text='4110';
begin
 perform public.accounting_assert(p_actor,true);perform 1 from public.accounting_settings where singleton for update;perform public.accounting_assert(p_actor,true);
 select * into e from public.payfast_payments where id=p_id for update;
 if e.id is null then raise exception 'Verified purchase payment not found.';end if;
 if e.journal_id is not null then return e.journal_id;end if;
 if e.review_required and (not coalesce(p_reviewed,false) or length(trim(coalesce(p_reason,'')))<5) then raise exception 'Review this legacy or repeated payment against provider and existing books before posting.';end if;
 if p_fee is not null then
  if not coalesce(p_reviewed,false) or length(trim(coalesce(p_reason,'')))<5 or (e.fee_cents is not null and e.fee_cents<>p_fee) or p_fee<0 or p_fee>e.gross_cents then raise exception 'Verify the fee against provider records; confirmed callback fees cannot be changed.';end if;
  e.fee_cents=p_fee;
 end if;
 if e.fee_cents is null then raise exception 'Verify the provider fee before posting this payment.';end if;
 select * into o from public.payfast_orders where id=e.order_id;
 if e.review_reason='repeat_order_payment' then credit='2300';end if;
 lines=jsonb_build_array(jsonb_build_object('account',credit,'cents',-e.gross_cents));
 if e.gross_cents>e.fee_cents then lines=lines||jsonb_build_array(jsonb_build_object('account','1020','cents',e.gross_cents-e.fee_cents));end if;
 if e.fee_cents>0 then lines=lines||jsonb_build_array(jsonb_build_object('account','5060','cents',e.fee_cents));end if;
 j=public.accounting_post(p_actor,'payfast:'||e.provider_id,public.tuition_today(),'Verified PayFast PDF payment '||e.provider_id,'payfast_sale',e.id,lines);
 update public.payfast_payments set journal_id=j,fee_cents=e.fee_cents,posting_error=null where id=e.id;
 perform public.accounting_audit(p_actor,'payfast_post',jsonb_build_object('paymentId',e.id,'providerId',e.provider_id,'grossCents',e.gross_cents,'feeCents',e.fee_cents,'journalId',j,'reviewed',p_reviewed,'reason',p_reason,'description',case when p_reviewed then 'Owner-reviewed provider payment posting' else 'Automatic verified provider posting under the authorized owner' end));
 return j;
end;
$function$;

create or replace function public.payfast_record_payment(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare e public.payfast_payments;o public.payfast_orders;p public.payfast_products;oid uuid=nullif(p_data->>'orderId','')::uuid;old boolean=oid is null;repeat_payment boolean;fp text;actor uuid;failure text;
begin
 perform 1 from public.accounting_settings where singleton for update;
 if length(coalesce(p_data->>'paymentId','')) not between 1 and 120 then raise exception 'A verified provider payment ID is required.';end if;
 fp=md5(jsonb_build_object('orderId',oid,'paymentId',p_data->>'paymentId','product',p_data->>'product','gross',p_data->'grossCents','fee',p_data->'feeCents','email',lower(trim(p_data->>'email')))::text);
 select * into e from public.payfast_payments where provider_id=p_data->>'paymentId';
 if e.id is not null then
  if e.fingerprint<>fp then raise exception 'This provider payment has conflicting details. Review provider records.';end if;
  return jsonb_build_object('orderId',e.order_id,'paymentId',e.id,'replayed',true);
 end if;
 select * into p from public.payfast_products where title=p_data->>'product';
 if p.title is null or (p_data->>'grossCents')::integer is distinct from p.amount_cents or (p_data->>'feeCents')::integer<0 or (p_data->>'feeCents')::integer>p.amount_cents then raise exception 'Verified product or payment amount does not match.';end if;
 if old then
  oid=md5('viva-legacy-payfast:'||(p_data->>'paymentId'))::uuid;
  insert into public.payfast_orders(id,product,amount_cents,file_name,first_name,last_name,email,phone,legacy) values(oid,p.title,p.amount_cents,p.file_name,coalesce(nullif(p_data->>'firstName',''),'Customer'),coalesce(nullif(p_data->>'lastName',''),'Customer'),lower(trim(p_data->>'email')),coalesce(nullif(p_data->>'phone',''),'Not provided'),true) on conflict do nothing;
 end if;
 select * into o from public.payfast_orders where id=oid for update;
 if o.id is null or o.product<>p.title or o.amount_cents<>p.amount_cents or o.email is distinct from lower(trim(p_data->>'email')) then raise exception 'This notification does not match its checkout order.';end if;
 repeat_payment=o.paid_at is not null;
 insert into public.payfast_payments(order_id,provider_id,gross_cents,fee_cents,review_required,review_reason,fingerprint) values(oid,p_data->>'paymentId',p.amount_cents,(p_data->>'feeCents')::integer,old or repeat_payment,case when old then 'legacy_callback' when repeat_payment then 'repeat_order_payment' end,fp) returning * into e;
 update public.payfast_orders set paid_at=coalesce(paid_at,now()) where id=oid;
 if not repeat_payment then
  insert into public.payfast_deliveries(order_id,kind,recipient,state,last_error) values(oid,'customer',o.email,case when old then 'uncertain' else 'pending' end,case when old then 'Legacy delivery history requires provider review.' end),(oid,'admin',p_data->>'adminEmail',case when old then 'uncertain' else 'pending' end,case when old then 'Legacy delivery history requires provider review.' end);
 end if;
 select actor_id into actor from public.payfast_settings where singleton;
 begin
  if actor is null then raise exception 'An owner must authorize PDF sales accounting in Finance Controls.';end if;
  perform public.payfast_post_payment(actor,e.id);
 exception when others then
  failure=case when sqlstate='P0001' then left(sqlerrm,300) else 'Posting needs owner review; the verified payment remains saved.' end;
  update public.payfast_payments set posting_error=failure where id=e.id;
 end;
 return jsonb_build_object('orderId',oid,'paymentId',e.id,'replayed',false);
end;
$function$;

create or replace function public.payfast_claim_delivery(p_order uuid,p_kind text,p_admin text default null) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare d public.payfast_deliveries;o public.payfast_orders;e public.payfast_payments;
begin
 if p_kind not in ('customer','admin') then raise exception 'Invalid delivery kind.';end if;
 if p_kind='admin' then update public.payfast_deliveries set recipient=p_admin where order_id=p_order and kind='admin' and state='pending' and recipient is null;end if;
 update public.payfast_deliveries set state='uncertain',last_error='Interrupted send requires provider review.' where order_id=p_order and kind=p_kind and state='sending' and claimed_at<now()-interval '15 minutes';
 update public.payfast_deliveries set state='sending',claim_id=gen_random_uuid(),claimed_at=now(),attempts=attempts+1,last_error=null where order_id=p_order and kind=p_kind and state='pending' and recipient is not null returning * into d;
 if d.id is null then return null;end if;
 select * into o from public.payfast_orders where id=p_order;
 select * into e from public.payfast_payments where order_id=p_order order by created_at,id limit 1;
 insert into public.payfast_delivery_events(delivery_id,claim_id,state) values(d.id,d.claim_id,'sending');
 return to_jsonb(d)||jsonb_build_object('order',to_jsonb(o),'payment',jsonb_build_object('providerId',e.provider_id,'verifiedOn',e.verified_on));
end;
$function$;
create or replace function public.payfast_finish_delivery(p_id uuid,p_claim uuid,p_state text,p_provider text default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $function$
begin
 if p_state not in ('accepted','failed','uncertain') then raise exception 'Invalid delivery outcome.';end if;
 update public.payfast_deliveries set state=p_state,finished_at=now(),provider_id=left(p_provider,150),last_error=left(p_error,300) where id=p_id and state='sending' and claim_id=p_claim;
 if found then insert into public.payfast_delivery_events(delivery_id,claim_id,state,provider_id) values(p_id,p_claim,p_state,left(p_provider,150));end if;
end;
$function$;

create or replace function public.payfast_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
begin
 perform public.admin_assert(p_actor);
 return jsonb_build_object('role',(select finance_role from public.admin_users where user_id=p_actor),
 'authorized',exists(select 1 from public.payfast_settings s join public.admin_users a on a.user_id=s.actor_id and a.enabled and a.finance_role='owner'),
 'unposted',(select count(*) from public.payfast_payments where journal_id is null),'deliveryAttention',(select count(*) from public.payfast_deliveries where state in ('failed','uncertain') or (state='sending' and claimed_at<now()-interval '15 minutes')),
 'clearingCents',public.accounting_balance('1020',public.tuition_today()),
 'payments',coalesce((select jsonb_agg(x order by x.created_at desc) from(select e.*,o.product,o.email,o.legacy from public.payfast_payments e join public.payfast_orders o on o.id=e.order_id order by (e.journal_id is null) desc,e.created_at desc limit 100)x),'[]'),
 'deliveries',coalesce((select jsonb_agg(x) from(select d.*,o.product,case when d.state='sending' and d.claimed_at<now()-interval '15 minutes' then 'uncertain' else d.state end display_state from public.payfast_deliveries d join public.payfast_orders o on o.id=d.order_id order by (d.state<>'accepted') desc,o.created_at desc,d.kind limit 200)x),'[]'),
 'settlements',coalesce((select jsonb_agg(x) from(select * from public.payfast_settlements order by posted_on desc limit 100)x),'[]'),
 'limited',(select count(*)>100 from public.payfast_payments) or (select count(*)>200 from public.payfast_deliveries));
end;
$function$;

create or replace function public.payfast_admin(p_actor uuid,p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare rid uuid=(p_data->>'requestId')::uuid;req public.accounting_requests;d public.payfast_deliveries;j uuid;n bigint;dt date;ref text;balance bigint;result jsonb='{}';reason text=trim(coalesce(p_data->>'reason',''));
begin
 perform public.accounting_assert(p_actor,true);perform 1 from public.accounting_settings where singleton for update;perform public.accounting_assert(p_actor,true);
 if rid is null or length(reason) not between 5 and 1000 then raise exception 'A stable request and review reason are required.';end if;
 select * into req from public.accounting_requests where id=rid;
 if req.id is not null then if req.actor_id<>p_actor or req.action<>'payfast_'||p_operation or req.payload<>p_data then raise exception 'This request belongs to different details.';end if;return req.result;end if;
 if p_operation='authorize' then
  update public.payfast_settings set actor_id=p_actor where singleton;
 elsif p_operation='dispatch' then
  if not exists(select 1 from public.payfast_orders where id=(p_data->>'orderId')::uuid and paid_at is not null) then raise exception 'Choose a verified paid order.';end if;
  result=jsonb_build_object('orderId',p_data->>'orderId');
 elsif p_operation='post' then
  if coalesce((p_data->>'reviewed')::boolean,false) is not true then raise exception 'Confirm the payment is not already in the books and verify provider fees.';end if;
  j=public.payfast_post_payment(p_actor,(p_data->>'id')::uuid,true,reason,(p_data->>'feeCents')::integer);result=jsonb_build_object('journalId',j);
 elsif p_operation='delivery_review' then
  select * into d from public.payfast_deliveries where id=(p_data->>'id')::uuid for update;
  if d.id is null or d.state not in ('failed','uncertain','sending') or (d.state='sending' and d.claimed_at>=now()-interval '15 minutes') or coalesce((p_data->>'reviewed')::boolean,false) is not true then raise exception 'Review an ambiguous, failed or interrupted delivery in the provider history first.';end if;
  if p_data->>'outcome'='accepted' then
   if length(trim(coalesce(p_data->>'providerId','')))<3 then raise exception 'Record the confirmed provider message ID.';end if;
   update public.payfast_deliveries set state='accepted',provider_id=left(p_data->>'providerId',150),finished_at=now(),last_error=null where id=d.id;
  elsif p_data->>'outcome'='not_sent' then
   update public.payfast_deliveries set state='pending',last_error='Retry authorized after provider review.' where id=d.id;
  else raise exception 'Choose the verified provider outcome.';end if;
  insert into public.payfast_delivery_events(delivery_id,state) values(d.id,'owner_review:'||(p_data->>'outcome'));
 elsif p_operation='settlement' then
  n=(p_data->>'amountCents')::bigint;dt=(p_data->>'postedOn')::date;ref=upper(trim(coalesce(p_data->>'reference','')));
  if n is null or n<=0 or dt is null or length(ref) not between 3 and 120 or n>public.accounting_balance('1020',dt) then raise exception 'Record a verified net settlement within the available PayFast clearing balance.';end if;
  if exists(select 1 from public.payfast_settlements where reference=ref and reversed_at is null) then raise exception 'This bank settlement reference is already recorded.';end if;
  j=public.accounting_post(p_actor,'payfast-settlement:'||rid,dt,'PayFast bank settlement '||ref,'payfast_settlement',rid,jsonb_build_array(jsonb_build_object('account','1000','cents',n),jsonb_build_object('account','1020','cents',-n)));
  select min(running) into balance from(select sum(sum(l.amount_cents)) over(order by x.posted_on) running from public.accounting_lines l join public.accounting_journals x on x.id=l.journal_id where l.account_code='1020' group by x.posted_on) q;
  if balance<0 then raise exception 'This settlement would overdraw the clearing account. Review the date and amount.';end if;
  insert into public.payfast_settlements(id,reference,amount_cents,posted_on,journal_id,actor_id) values(rid,ref,n,dt,j,p_actor);result=jsonb_build_object('journalId',j);
 elsif p_operation='settlement_reverse' then
  select journal_id into j from public.payfast_settlements where id=(p_data->>'id')::uuid and reversed_at is null for update;
  if j is null then raise exception 'Choose an unreversed settlement.';end if;
  j=public.accounting_reverse(p_actor,j,rid,public.tuition_today(),reason);
  update public.payfast_settlements set reversed_at=now(),reversal_journal_id=j where id=(p_data->>'id')::uuid;result=jsonb_build_object('journalId',j);
 else raise exception 'Unknown PDF purchase action.';end if;
 perform public.accounting_audit(p_actor,'payfast_'||p_operation,p_data-'requestId');
 insert into public.accounting_requests(id,actor_id,action,payload,result) values(rid,p_actor,'payfast_'||p_operation,p_data,result);
 return result;
end;
$function$;
revoke all on function public.payfast_order_create(uuid,text,text,text,text,text),public.payfast_post_payment(uuid,uuid,boolean,text,integer),public.payfast_record_payment(jsonb),public.payfast_claim_delivery(uuid,text,text),public.payfast_finish_delivery(uuid,uuid,text,text,text),public.payfast_snapshot(uuid),public.payfast_admin(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.payfast_order_create(uuid,text,text,text,text,text),public.payfast_record_payment(jsonb),public.payfast_claim_delivery(uuid,text,text),public.payfast_finish_delivery(uuid,uuid,text,text,text),public.payfast_snapshot(uuid),public.payfast_admin(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';

create or replace function public.accounting_safety_health(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid;c integer;
begin
 perform public.admin_assert(p_actor);
 select user_id into owner_id from public.admin_users where enabled and finance_role='owner' order by user_id limit 1;
 if owner_id is not null then c=jsonb_array_length(public.accounting_billing_candidates(owner_id,date_trunc('month',public.tuition_today())::date));end if;
 return jsonb_build_object('missingCurrentInvoices',c,'unpostedPurchases',(select count(*) from public.payfast_payments where journal_id is null),'pendingDeliveries',(select count(*) from public.payfast_deliveries where state='pending'),'deliveryAttention',(select count(*) from public.payfast_deliveries where state in ('failed','uncertain') or (state='sending' and claimed_at<now()-interval '15 minutes')));
end $$;
revoke all on function public.accounting_safety_health(uuid) from public,anon,authenticated;
grant execute on function public.accounting_safety_health(uuid) to service_role;

create or replace function public.payfast_protect_source() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Keep verified purchase history; record a reviewed correction.';end if;
 if tg_table_name='payfast_orders' then
  if (to_jsonb(new)-'paid_at') is distinct from (to_jsonb(old)-'paid_at') or (old.paid_at is not null and new.paid_at is distinct from old.paid_at) then raise exception 'Checkout order details are immutable.';end if;
 elsif tg_table_name='payfast_payments' then
  if (to_jsonb(new)-array['journal_id','posting_error','fee_cents']) is distinct from (to_jsonb(old)-array['journal_id','posting_error','fee_cents']) or (old.fee_cents is not null and new.fee_cents is distinct from old.fee_cents) or (old.journal_id is not null and new.journal_id is distinct from old.journal_id) then raise exception 'Verified provider payment details are immutable.';end if;
 elsif tg_table_name='payfast_settlements' then
  if (to_jsonb(new)-array['reversed_at','reversal_journal_id']) is distinct from (to_jsonb(old)-array['reversed_at','reversal_journal_id']) or (old.reversed_at is not null and to_jsonb(new) is distinct from to_jsonb(old)) then raise exception 'Keep the original settlement; use a reviewed reversal.';end if;
 end if;
 return new;
end $$;
drop trigger if exists payfast_order_immutable on public.payfast_orders;
create trigger payfast_order_immutable before update or delete on public.payfast_orders for each row execute function public.payfast_protect_source();
drop trigger if exists payfast_payment_immutable on public.payfast_payments;
create trigger payfast_payment_immutable before update or delete on public.payfast_payments for each row execute function public.payfast_protect_source();
drop trigger if exists payfast_settlement_immutable on public.payfast_settlements;
create trigger payfast_settlement_immutable before update or delete on public.payfast_settlements for each row execute function public.payfast_protect_source();
drop trigger if exists payfast_delivery_history_immutable on public.payfast_delivery_events;
create trigger payfast_delivery_history_immutable before update or delete on public.payfast_delivery_events for each row execute function public.accounting_immutable();
revoke all on function public.payfast_protect_source() from public,anon,authenticated;

-- END HIGH PRIORITY RECOVERY
