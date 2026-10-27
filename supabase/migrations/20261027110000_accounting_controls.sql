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
