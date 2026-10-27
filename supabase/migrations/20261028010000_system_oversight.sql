-- Admin oversight. No existing business records or automation defaults are reset.
do $setup$
begin
 if to_regprocedure('public.academic_snapshot(uuid,text,uuid,uuid,uuid)') is null
    and to_regclass('public.academic_tasks') is null then
   raise exception 'Apply the connected teaching and academic setup before system oversight.';
 end if;
 if to_regprocedure('public.accounting_integrity()') is null then
   raise exception 'Apply the accounting setup before system oversight.';
 end if;
end;
$setup$;

create table if not exists public.system_preferences (
 singleton boolean primary key default true check(singleton),
 revision integer not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
insert into public.system_preferences(singleton) values(true) on conflict do nothing;
create table if not exists public.system_requests (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 operation text not null, input jsonb not null, result jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.system_backup_reviews (
 id uuid primary key default gen_random_uuid(), checked_on date not null,
 method text not null check(method in ('provider_review','export_review','restore_test')),
 note text not null check(length(trim(note)) between 5 and 1000),
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.system_job_events (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 source text not null check(source in ('scheduled','manual')),
 started_at timestamptz not null default now(), finished_at timestamptz,
 state text not null default 'running' check(state in ('running','completed','failed')),
 result jsonb not null default '{}'
);
create table if not exists public.system_email_tests (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 requested_at timestamptz not null default now(), finished_at timestamptz,
 state text not null default 'pending' check(state in ('pending','accepted','failed','uncertain')),
 provider_id text
);
create index if not exists system_job_recent on public.system_job_events(started_at desc);
create index if not exists system_email_recent on public.system_email_tests(requested_at desc);
do $permissions$
declare t text;
begin
 foreach t in array array['system_preferences','system_requests','system_backup_reviews','system_job_events','system_email_tests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end;
$permissions$;

create or replace function public.system_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_owner boolean; v_snapshot jsonb;
begin
 perform public.admin_assert(p_actor);
 select finance_role='owner' into v_owner from public.admin_users where user_id=p_actor;
 select jsonb_build_object(
  'now',now(),'today',public.tuition_today(),'role',(select finance_role from public.admin_users where user_id=p_actor),
  'revision',(select revision from public.system_preferences where singleton),
  'accounting',(select jsonb_build_object('books_start',s.books_start,'closed_through',s.closed_through,'automation_enabled',s.automation_enabled,'auto_send',s.auto_send,'scheduler_valid',exists(select 1 from public.admin_users a where a.user_id=s.scheduler_actor and a.enabled and a.finance_role='owner')) from public.accounting_settings s where singleton),
  'programmes',coalesce((select jsonb_agg(p order by grade) from public.tuition_programmes p),'[]'::jsonb),
  'closures',coalesce((select jsonb_agg(c order by day) from public.tuition_closures c),'[]'::jsonb),
  'admins',case when v_owner then coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'email',u.email,'enabled',a.enabled,'role',a.finance_role) order by u.email) from public.admin_users a join auth.users u on u.id=a.user_id),'[]'::jsonb) else '[]'::jsonb end,
  'candidates',case when v_owner then coalesce((select jsonb_agg(c) from(select u.id,u.email from auth.users u where nullif(to_jsonb(u)->>'email_confirmed_at','') is not null and u.email is not null and not exists(select 1 from public.admin_users a where a.user_id=u.id) order by u.email limit 100)c),'[]'::jsonb) else '[]'::jsonb end,
  'candidatesLimited',case when v_owner then (select count(*)>100 from auth.users u where nullif(to_jsonb(u)->>'email_confirmed_at','') is not null and u.email is not null and not exists(select 1 from public.admin_users a where a.user_id=u.id)) else false end,
  'backups',coalesce((select jsonb_agg(b order by b.created_at desc) from(select id,checked_on,method,note,created_at from public.system_backup_reviews order by created_at desc limit 20)b),'[]'::jsonb),
  'jobs',coalesce((select jsonb_agg(j order by j.started_at desc) from(select id,source,started_at,finished_at,state,result from public.system_job_events order by started_at desc limit 20)j),'[]'::jsonb),
  'scheduledJob',(select to_jsonb(j) from(select id,source,started_at,finished_at,state,result from public.system_job_events where source='scheduled' order by started_at desc limit 1)j),
  'emailTests',coalesce((select jsonb_agg(e order by e.requested_at desc) from(select id,requested_at,finished_at,state from public.system_email_tests order by requested_at desc limit 10)e),'[]'::jsonb),
  'issues',coalesce((select jsonb_agg(x) from (
   select a.id::text id,'report_metadata'::text kind,a.application_number||' · '||a.learner_name label,'Report card metadata missing'::text context,'Applications'::text target
    from public.applications a where a.status='pending_review' and not exists(select 1 from public.learner_documents d where d.application_id=a.id and d.storage_path=a.report_card_path)
   union all select d.id::text,'report_file',a.application_number||' · '||d.file_name,'Report card Storage object missing','Applications'
    from public.learner_documents d join public.applications a on a.id=d.application_id where not exists(select 1 from storage.objects o where o.bucket_id='learner-documents' and o.name=d.storage_path)
   union all select v.id::text,'material_file',m.title||' · '||v.file_name,case when v.finalized_at is null then 'Teaching upload unfinished for over an hour' else 'Teaching material Storage object missing' end,'Materials'
    from public.teaching_material_versions v join public.teaching_materials m on m.id=v.material_id where (v.finalized_at is null and v.created_at<now()-interval '1 hour') or (v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='teaching-materials' and o.name=v.storage_path))
   union all select v.id::text,'assessment_file',a.application_number||' · '||v.file_name,case when v.finalized_at is null then 'Assessment upload unfinished for over an hour' else 'Assessment response Storage object missing' end,'Assessments'
    from public.academic_uploads v join public.academic_attempts t on t.id=v.attempt_id join public.applications a on a.id=t.application_id where not v.discarded and ((v.finalized_at is null and v.created_at<now()-interval '1 hour') or (v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='academic-submissions' and o.name=v.storage_path)))
   union all select v.id::text,'expense_file',v.name,case when v.finalized_at is null then 'Expense evidence unfinished for over an hour' else 'Expense evidence Storage object missing' end,'Finance'
    from public.accounting_attachments v where (v.finalized_at is null and v.created_at<now()-interval '1 hour') or (v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='accounting-documents' and o.name=v.storage_path))
   order by kind,label limit 100
  )x),'[]'::jsonb),
  'health',jsonb_build_object(
   'modules',jsonb_build_object(
    'Enrollment',to_regprocedure('public.submit_enrollment(jsonb)') is not null and to_regprocedure('public.finalize_enrollment_document(uuid,text)') is not null,
    'Admin',to_regprocedure('public.admin_snapshot(uuid)') is not null,
    'Parents',to_regprocedure('public.parent_snapshot(uuid)') is not null,
    'Students',to_regprocedure('public.student_snapshot(uuid,text,uuid)') is not null,
    'Teaching',to_regprocedure('public.teaching_snapshot(uuid,text)') is not null,
    'Academics',to_regprocedure('public.academic_snapshot(uuid,text,uuid,uuid,uuid)') is not null
   ),
   'integrity',public.accounting_integrity(),
   'queuedMessages',(select count(*) from public.tuition_messages where state='pending'),
   'failedMessages',(select count(*) from public.tuition_messages where state='failed'),
   'ambiguousMessages',(select count(*) from public.tuition_messages where state='sending' and claimed_at<now()-interval '15 minutes'),
   'enrollmentEmailErrors',(select count(*) from public.applications where nullif(email_last_error,'') is not null),
   'missingReportRecords',(select count(*) from public.applications a where a.status='pending_review' and not exists(select 1 from public.learner_documents d where d.application_id=a.id and d.storage_path=a.report_card_path)),
   'missingStoredFiles',(select count(*) from public.learner_documents d where not exists(select 1 from storage.objects o where o.bucket_id='learner-documents' and o.name=d.storage_path))
       +(select count(*) from public.teaching_material_versions v where v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='teaching-materials' and o.name=v.storage_path))
       +(select count(*) from public.academic_uploads v where v.finalized_at is not null and not v.discarded and not exists(select 1 from storage.objects o where o.bucket_id='academic-submissions' and o.name=v.storage_path))
       +(select count(*) from public.accounting_attachments v where v.finalized_at is not null and not exists(select 1 from storage.objects o where o.bucket_id='accounting-documents' and o.name=v.storage_path)),
   'unfinishedUploads',(select count(*) from public.teaching_material_versions where finalized_at is null and created_at<now()-interval '1 hour')
       +(select count(*) from public.academic_uploads where finalized_at is null and not discarded and created_at<now()-interval '1 hour')
       +(select count(*) from public.accounting_attachments where finalized_at is null and created_at<now()-interval '1 hour'),
   'unfinishedSessions',(select count(*) from public.teaching_sessions where status='scheduled' and ends_at<now()),
   'marksInReview',(select count(*) from public.academic_grades where state='review'),
   'pendingApplications',(select count(*) from public.applications where status='pending_review'),
   'access',jsonb_build_object('admins',(select count(*) from public.admin_users where enabled),'parents',(select count(*) from public.parent_accounts where enabled),'tutors',(select count(*) from public.teaching_tutors where enabled),'students',(select count(*) from public.student_accounts where enabled))
  )
 ) into v_snapshot;
 return v_snapshot;
end;
$function$;

create or replace function public.system_mutate(p_actor uuid,p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare preferences public.system_preferences; prior public.system_requests; request_id uuid; target uuid; v_day date; why text; result jsonb; v_enabled boolean; role text;
begin
 perform public.accounting_assert(p_actor,true);
 request_id=(p_data->>'requestId')::uuid;
 if request_id is null then raise exception 'A change request identifier is required.';end if;
 -- Same lock order as accounting: staff permissions, then finance settings.
 perform pg_advisory_xact_lock(71228001);
 perform 1 from public.accounting_settings where singleton for update;
 perform public.accounting_assert(p_actor,true);
 select * into preferences from public.system_preferences where singleton for update;
 select * into prior from public.system_requests where id=request_id;
 if prior.id is not null then
  if prior.actor_id<>p_actor or prior.operation<>p_operation or prior.input<>p_data then raise exception 'This request identifier belongs to a different change.';end if;
  return prior.result;
 end if;
 if (p_data->>'revision')::integer is distinct from preferences.revision then raise exception 'Settings changed since you opened them. Refresh and review your choices again.';end if;
 why=trim(coalesce(p_data->>'reason',''));
 if length(why) not between 5 and 1000 then raise exception 'Choose a reason or record a review note.';end if;
 if p_operation='admin_access' then
  if nullif(p_data->>'userId','') is not null then target=(p_data->>'userId')::uuid;
  else
   if (select count(*) from auth.users u where lower(trim(u.email))=lower(trim(p_data->>'userEmail')) and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null)<>1 then raise exception 'The verified staff email must identify exactly one Auth account.';end if;
   select id into target from auth.users u where lower(trim(u.email))=lower(trim(p_data->>'userEmail')) and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null;
  end if;
  v_enabled=(p_data->>'enabled')::boolean; role=p_data->>'role';
  if target is null or v_enabled is null or role is null or role not in ('owner','bookkeeper','viewer') then raise exception 'Choose a staff account, role and access state.';end if;
  if target=p_actor then raise exception 'Another owner must change your own permissions.';end if;
  if v_enabled and not exists(select 1 from auth.users u where u.id=target and u.email is not null and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null) then raise exception 'Create and verify the staff Auth account before granting access.';end if;
  if not v_enabled and not exists(select 1 from public.admin_users where user_id=target) then raise exception 'This account has no admin access to disable.';end if;
  if exists(select 1 from public.admin_users where user_id=target and enabled and finance_role='owner') and (not v_enabled or role<>'owner') and (select count(*) from public.admin_users where enabled and finance_role='owner')<=1 then raise exception 'Keep at least one enabled owner.';end if;
  if (not v_enabled or role<>'owner') and exists(select 1 from public.accounting_settings where singleton and automation_enabled and scheduler_actor=target) then raise exception 'Save automation as another owner, or disable automation, before changing the scheduled-run owner.';end if;
  insert into public.admin_users(user_id,enabled,finance_role) values(target,v_enabled,role) on conflict(user_id) do update set enabled=excluded.enabled,finance_role=excluded.finance_role;
  perform public.accounting_audit(p_actor,'system_admin_access',jsonb_build_object('targetEmail',(select email from auth.users where id=target),'enabled',v_enabled,'role',role,'reason',why,'description','Admin access and finance permissions reviewed'));
 elsif p_operation='automation' then
  if jsonb_typeof(p_data->'automationEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'autoSend') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedAutomationEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedAutoSend') is distinct from 'boolean' then raise exception 'Choose valid automation settings.';end if;
  if exists(select 1 from public.accounting_settings where singleton and (automation_enabled is distinct from (p_data->>'expectedAutomationEnabled')::boolean or auto_send is distinct from (p_data->>'expectedAutoSend')::boolean)) then raise exception 'Automation changed since you opened it. Refresh and review again.';end if;
  perform public.accounting_mutate(p_actor,'settings',p_data||jsonb_build_object('booksStart',(select books_start from public.accounting_settings where singleton)));
 elsif p_operation in ('closure_add','closure_remove') then
  perform pg_advisory_xact_lock(71228003);
  v_day=(p_data->>'day')::date;
  if v_day is null or v_day<public.tuition_today() or extract(month from v_day) not between 2 and 11 then raise exception 'Choose today or a future teaching date in February to November.';end if;
  if p_operation='closure_add' then
   if exists(select 1 from public.teaching_sessions where (starts_at at time zone 'Africa/Johannesburg')::date=v_day and status<>'cancelled') then raise exception 'Cancel or reschedule existing sessions on this date before adding a closure.';end if;
   if exists(select 1 from public.tuition_closures c where c.day=v_day) then raise exception 'This date is already a closure.';end if;
   insert into public.tuition_closures values(v_day,why);
  else
   delete from public.tuition_closures c where c.day=v_day;
   if not found then raise exception 'This closure is no longer present. Refresh the calendar.';end if;
  end if;
  perform public.accounting_audit(p_actor,'system_'||p_operation,jsonb_build_object('day',v_day,'reason',why,'description',case when p_operation='closure_add' then 'Teaching closure added; issued invoices retain their original calendar' else 'Future closure removed; historical records retained' end));
 elsif p_operation='backup_review' then
  v_day=(p_data->>'checkedOn')::date;
  if v_day is null or v_day>public.tuition_today() then raise exception 'Choose today or an earlier backup review date.';end if;
  if p_data->>'method' is null or p_data->>'method' not in ('provider_review','export_review','restore_test') then raise exception 'Choose what was actually checked.';end if;
  insert into public.system_backup_reviews(checked_on,method,note,actor_id) values(v_day,p_data->>'method',why,p_actor);
  perform public.accounting_audit(p_actor,'system_backup_review',jsonb_build_object('day',v_day,'method',p_data->>'method','reason',why,'description','Owner-reported backup review recorded; no backup or restore was run by the application'));
 else raise exception 'Unknown system settings action.';
 end if;
 update public.system_preferences set revision=revision+1,updated_at=now(),updated_by=p_actor where singleton returning jsonb_build_object('revision',revision,'success',true) into result;
 insert into public.system_requests values(request_id,p_actor,p_operation,p_data,result,now());
 return result;
end;
$function$;

create or replace function public.system_job_record(p_actor uuid,p_id uuid,p_source text,p_state text,p_result jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $function$
begin
 perform public.accounting_assert(p_actor,true);
 if p_source is null or p_source not in ('scheduled','manual') or p_state is null or p_state not in ('running','completed','failed') or pg_column_size(p_result)>16384 then raise exception 'Invalid run record.';end if;
 if p_state='running' then
  insert into public.system_job_events(id,actor_id,source) values(p_id,p_actor,p_source) on conflict do nothing;
 else
  update public.system_job_events set state=p_state,finished_at=now(),result=p_result where id=p_id and actor_id=p_actor and source=p_source and state='running';
 end if;
end;
$function$;

create or replace function public.system_email_test_claim(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare test public.system_email_tests; destination text;
begin
 perform public.accounting_assert(p_actor,true);
 perform pg_advisory_xact_lock(71228002);
 select * into test from public.system_email_tests where id=p_id;
 if test.id is not null then
  if test.actor_id<>p_actor then raise exception 'This email check belongs to another owner.';end if;
  return jsonb_build_object('send',false,'id',test.id,'state',test.state);
 end if;
 select email into destination from auth.users u where u.id=p_actor and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null;
 if destination is null then raise exception 'Verify your admin email before requesting a test.';end if;
 if exists(select 1 from public.system_email_tests where requested_at>now()-interval '1 minute') then raise exception 'Wait one minute before requesting another test email.';end if;
 insert into public.system_email_tests(id,actor_id) values(p_id,p_actor);
 perform public.accounting_audit(p_actor,'system_email_test',jsonb_build_object('description','A single provider test was requested for the signed-in owner email','requestId',p_id));
 return jsonb_build_object('send',true,'id',p_id,'to',destination,'state','pending');
end;
$function$;
create or replace function public.system_email_test_finish(p_actor uuid,p_id uuid,p_state text,p_provider_id text default null) returns void
language plpgsql security definer set search_path='' as $function$
begin
 perform public.accounting_assert(p_actor,true);
 if p_state is null or p_state not in ('accepted','failed','uncertain') then raise exception 'Invalid email check result.';end if;
 update public.system_email_tests set state=p_state,provider_id=left(p_provider_id,120),finished_at=now() where id=p_id and actor_id=p_actor and state='pending';
end;
$function$;
revoke all on function public.system_snapshot(uuid),public.system_mutate(uuid,text,jsonb),public.system_job_record(uuid,uuid,text,text,jsonb),public.system_email_test_claim(uuid,uuid),public.system_email_test_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.system_snapshot(uuid),public.system_mutate(uuid,text,jsonb),public.system_job_record(uuid,uuid,text,text,jsonb),public.system_email_test_claim(uuid,uuid),public.system_email_test_finish(uuid,uuid,text,text) to service_role;

-- Serialize new/rescheduled sessions with closure changes; never rewrite existing history.
create or replace function public.system_guard_session_calendar() returns trigger
language plpgsql security definer set search_path='' as $calendar$
begin
 if new.status='scheduled' and (tg_op='INSERT' or new.starts_at is distinct from old.starts_at or new.status is distinct from old.status) then
  perform pg_advisory_xact_lock(71228003);
  if exists(select 1 from public.tuition_closures c where c.day=(new.starts_at at time zone 'Africa/Johannesburg')::date) then raise exception 'This date is a teaching closure. Choose another session date.';end if;
 end if;
 return new;
end;
$calendar$;
drop trigger if exists system_session_calendar_guard on public.teaching_sessions;
create trigger system_session_calendar_guard before insert or update of starts_at,status on public.teaching_sessions for each row execute function public.system_guard_session_calendar();
revoke all on function public.system_guard_session_calendar() from public,anon,authenticated;
