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
