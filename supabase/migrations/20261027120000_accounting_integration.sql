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
