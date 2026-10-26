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
