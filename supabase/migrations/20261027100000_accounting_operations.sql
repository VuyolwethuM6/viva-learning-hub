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
