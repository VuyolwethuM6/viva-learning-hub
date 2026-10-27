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
