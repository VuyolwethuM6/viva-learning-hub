-- Parent portal upgrade. Apply after the accounting setup. Preserves all existing records.
begin;
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

commit;
