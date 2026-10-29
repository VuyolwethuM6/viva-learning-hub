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
