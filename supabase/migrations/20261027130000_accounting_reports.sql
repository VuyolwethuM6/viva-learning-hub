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
