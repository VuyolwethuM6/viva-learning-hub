-- Combined admin setup for an EXISTING Viva intake/document database.
-- Includes email claims, admin/tuition, verified finalization, monthly numbering and notification management migrations.
-- No admin account or credentials are embedded. Apply the intake/document prerequisites first.
begin;
do $$
begin
  if to_regclass('public.applications') is null
     or to_regclass('public.learners') is null
     or to_regclass('public.guardians') is null
     or to_regclass('public.application_subjects') is null
     or to_regclass('public.learner_documents') is null
     or to_regprocedure('public.finalize_enrollment_document(uuid,text)') is null then
    raise exception 'Existing intake/document setup is incomplete. Apply the base schema and learner-document migration first.';
  end if;
end $$;

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

commit;
