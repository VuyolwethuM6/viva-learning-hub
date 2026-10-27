do $$ begin if to_regprocedure('public.student_assert(uuid)') is null then raise exception 'Apply the connected teaching/student portal setup before academic setup.';end if;end $$;
-- Use wall time after acquiring locks; transaction-start now() can accept late work after a wait.
create or replace function public.academic_now() returns timestamptz language sql volatile set search_path='' as $$select clock_timestamp()$$;
revoke all on function public.academic_now() from public,anon,authenticated;
-- Academic workflow: additive, audited, private, service-only entry points.
create table if not exists public.academic_periods(
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.teaching_classes(id),
 starts_on date not null,ends_on date not null,method text not null check(method in ('total_marks','equal_weight','weighted')),
 missing_policy text not null default 'exclude' check(missing_policy='exclude'),created_at timestamptz not null default now(),check(ends_on>=starts_on),unique(class_id,starts_on,ends_on)
);
create table if not exists public.academic_tasks(
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.teaching_classes(id),period_id uuid not null references public.academic_periods(id),
 session_id uuid references public.teaching_sessions(id),topic_id uuid not null references public.teaching_topics(id),title text not null check(length(trim(title)) between 2 and 180),
 topic_title text not null,learning_goal text not null,kind text not null check(kind in ('activity','homework','exam')),
 purpose text not null check(purpose in ('diagnostic','formative','summative')),format text not null check(format in ('Quiz','Worksheet','Homework','Project','Test','Practical','Exam')),
 instructions text not null check(length(trim(instructions)) between 5 and 4000),submission_method text not null check(submission_method in ('file','text','both')),
 opens_at timestamptz not null,due_at timestamptz not null,closes_at timestamptz not null,duration_minutes integer check(duration_minutes between 5 and 360),
 max_marks numeric(8,2) not null check(max_marks>0 and max_marks<=10000),counts_average boolean not null,weight numeric(8,2) not null check(weight>0 and weight<=100),
 max_attempts integer not null check(max_attempts between 1 and 3),state text not null default 'draft' check(state in ('draft','assigned','cancelled')),
 memo_released boolean not null default false,created_by uuid not null references auth.users(id),revision integer not null default 0,created_at timestamptz not null default now(),
 check(opens_at<due_at and due_at<=closes_at),check(purpose<>'diagnostic' or not counts_average),check(kind<>'exam' or (max_attempts=1 and due_at=closes_at and duration_minutes is not null)),check(kind<>'activity' or session_id is not null)
);
create table if not exists public.academic_recipients(
 task_id uuid not null references public.academic_tasks(id),application_id uuid not null references public.applications(id),
 learner_name text not null,student_number text not null,starting_mark numeric(5,2),target_mark numeric(5,2),
 extended_closes_at timestamptz,extra_minutes integer not null default 0 check(extra_minutes between 0 and 360),primary key(task_id,application_id)
);
create table if not exists public.academic_resources(
 task_id uuid not null references public.academic_tasks(id),version_id uuid not null references public.teaching_material_versions(id),
 role text not null check(role in ('instructions','memo')),primary key(task_id,version_id)
);
create table if not exists public.academic_attempts(
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.academic_tasks(id),application_id uuid not null references public.applications(id),
 attempt integer not null check(attempt between 1 and 3),state text not null default 'draft' check(state in ('draft','submitted','returned')),
 answer text not null default '' check(length(answer)<=6000),started_at timestamptz not null,submitted_at timestamptz,receipt uuid unique,
 revision integer not null default 0,return_reason text,late boolean not null default false,unique(task_id,application_id,attempt),
 foreign key(task_id,application_id) references public.academic_recipients(task_id,application_id)
);
create table if not exists public.academic_uploads(
 id uuid primary key,attempt_id uuid not null references public.academic_attempts(id),file_name text not null check(length(file_name) between 1 and 200),
 storage_path text not null unique,mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),size_bytes integer not null check(size_bytes between 1 and 10485760),
 finalized_at timestamptz,discarded boolean not null default false,created_at timestamptz not null default now()
);
create table if not exists public.academic_grades(
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.academic_tasks(id),application_id uuid not null references public.applications(id),
 attempt_id uuid not null references public.academic_attempts(id),revision integer not null,score numeric(8,2) not null check(score>=0),
 feedback text not null check(length(trim(feedback)) between 2 and 4000),staff_note text not null default '' check(length(staff_note)<=2000),
 state text not null default 'draft' check(state in ('draft','review','published','rejected')),reason text not null default '',
 marked_by uuid not null references auth.users(id),created_at timestamptz not null default now(),published_by uuid references auth.users(id),published_at timestamptz,
 unique(task_id,application_id,revision),foreign key(task_id,application_id) references public.academic_recipients(task_id,application_id)
);
create table if not exists public.academic_reports(
 id uuid primary key default gen_random_uuid(),period_id uuid not null references public.academic_periods(id),application_id uuid not null references public.applications(id),
 content jsonb not null,reason text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index if not exists academic_tasks_class on public.academic_tasks(class_id,created_at);
create index if not exists academic_recipient_learner on public.academic_recipients(application_id,task_id);
create index if not exists academic_attempt_learner on public.academic_attempts(application_id,task_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('academic-submissions','academic-submissions',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.academic_track() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;cid uuid;tid uuid;aid uuid;
begin
 if tg_op='DELETE' then raise exception 'Academic history cannot be deleted.';end if;
 actor=nullif(current_setting('viva.teaching_actor',true),'')::uuid;
 if actor is null then raise exception 'Use an authorized academic operation.';end if;
 if tg_table_name in ('academic_periods','academic_tasks') then cid=new.class_id;
 elsif tg_table_name='academic_reports' then select class_id into cid from public.academic_periods where id=new.period_id;
 elsif tg_table_name='academic_uploads' then select task_id into tid from public.academic_attempts where id=new.attempt_id;
 else tid=new.task_id;end if;
 if tid is not null then select class_id into cid from public.academic_tasks where id=tid;end if;
 -- Contents/answers/marks are retained in protected rows, not copied to the
 -- general class teaching history which is broader than per-learner marking.
 insert into public.teaching_events(actor_id,action,class_id,details) values(actor,tg_table_name||':'||lower(tg_op),cid,jsonb_build_object('recordId',coalesce(to_jsonb(new)->>'id',tid::text),'requestId',current_setting('viva.academic_request',true)));
 return new;
end $$;
do $$ declare n text;begin
 foreach n in array array['academic_periods','academic_tasks','academic_recipients','academic_resources','academic_attempts','academic_uploads','academic_grades','academic_reports'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant all on public.%I to service_role',n);
 execute format('drop trigger if exists academic_track on public.%I',n);
 execute format('create trigger academic_track after insert or update or delete on public.%I for each row execute function public.academic_track()',n);
 end loop;
 -- Frozen reports may only be appended.
 execute 'drop trigger if exists academic_report_immutable on public.academic_reports';
 execute 'create trigger academic_report_immutable before update or delete on public.academic_reports for each row execute function public.teaching_history_immutable()';
end $$;
create or replace function public.academic_learner(p_user uuid,p_audience text,p_application uuid default null) returns uuid language plpgsql stable security definer set search_path='' as $$
declare r public.student_accounts;
begin
 if p_audience='student' then r=public.student_assert(p_user);if p_application is not null and p_application<>r.application_id then raise exception 'This learner is not available to your account.';end if;return r.application_id;
 elsif p_audience='parent' then perform public.parent_assert(p_user);if p_application is null or not exists(select 1 from public.parent_scope(p_user) x where x=p_application) then raise exception 'This learner is not available to your family.';end if;return p_application;
 else raise exception 'Invalid learner audience.';end if;
end $$;
create or replace function public.academic_deadline(p_attempt uuid) returns timestamptz language sql stable security definer set search_path='' as $$
 select least(coalesce(r.extended_closes_at,t.closes_at),case when t.duration_minutes is null then 'infinity'::timestamptz else a.started_at+make_interval(mins=>t.duration_minutes+r.extra_minutes) end)
 from public.academic_attempts a join public.academic_tasks t on t.id=a.task_id join public.academic_recipients r on r.task_id=a.task_id and r.application_id=a.application_id where a.id=p_attempt;
$$;
create or replace function public.academic_progress(p_application uuid,p_period uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.academic_periods;average numeric; n integer;expected integer;diagnostics jsonb; marks jsonb;result jsonb;target numeric;starting numeric;subject text;classname text;
begin
 select * into p from public.academic_periods where id=p_period;
 select c.subject,c.name into subject,classname from public.teaching_classes c where c.id=p.class_id;
 select current_mark,target_mark into starting,target from public.application_subjects where application_id=p_application and subject_name=subject;
 select count(*) into expected from public.academic_tasks t join public.academic_recipients r on r.task_id=t.id where r.application_id=p_application and t.period_id=p.id and t.state='assigned' and t.counts_average;
 select count(*),case p.method when 'total_marks' then 100*sum(g.score)/nullif(sum(t.max_marks),0) when 'equal_weight' then avg(100*g.score/t.max_marks) else sum(100*g.score/t.max_marks*t.weight)/nullif(sum(t.weight),0) end into n,average
 from public.academic_tasks t join lateral(select score from public.academic_grades x where x.task_id=t.id and x.application_id=p_application and x.state='published' order by revision desc limit 1)g on true
 where t.period_id=p.id and t.state='assigned' and t.counts_average and t.purpose<>'diagnostic';
 select coalesce(jsonb_agg(jsonb_build_object('taskId',t.id,'title',t.title,'score',g.score,'maxMarks',t.max_marks,'percentage',round(100*g.score/t.max_marks,2),'feedback',g.feedback,'weight',t.weight,'countsAverage',t.counts_average,'purpose',t.purpose,'publishedAt',g.published_at,'revision',g.revision) order by g.published_at,t.id),'[]') into marks
 from public.academic_tasks t join lateral(select score,feedback,published_at,revision from public.academic_grades x where x.task_id=t.id and x.application_id=p_application and x.state='published' order by revision desc limit 1)g on true where t.period_id=p.id;
 select coalesce(jsonb_agg(m),'[]') into diagnostics from jsonb_array_elements(marks) m where m->>'purpose'='diagnostic';
 result=jsonb_build_object('periodId',p.id,'className',classname,'subject',subject,'startsOn',p.starts_on,'endsOn',p.ends_on,'method',p.method,'missingPolicy',p.missing_policy,'average',round(average,2),'assessmentCount',n,'expectedCount',expected,'missingCount',expected-n,'startingMark',starting,'targetMark',target,'gapToTarget',case when average is null or target is null then null else round(target-average,2) end,'diagnostics',diagnostics,'marks',marks,'calculatedAt',public.academic_now());
 return result||jsonb_build_object('fingerprint',md5((result-'calculatedAt')::text));
end $$;

create or replace function public.academic_mutate(p_actor uuid,p_audience text,p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare rid uuid=(p_data->>'requestId')::uuid;cid uuid=(p_data->>'classId')::uuid;tid uuid=(p_data->>'taskId')::uuid;aid uuid;attempt_id uuid=(p_data->>'attemptId')::uuid;
 t public.academic_tasks;c public.teaching_classes;p public.academic_periods;tp public.teaching_topics;r public.academic_recipients;att public.academic_attempts;up public.academic_uploads;g public.academic_grades;req public.teaching_requests;
 result jsonb='{}';item jsonb;vid uuid;meta jsonb;latest integer;reason text=trim(coalesce(p_data->>'reason',''));v_open timestamptz;v_due timestamptz;v_close timestamptz;counted integer;
begin
 if rid is null then raise exception 'A stable request ID is required.';end if;
 if p_audience in ('admin','tutor') then perform public.teaching_access(p_actor,p_audience,cid);
 elsif p_audience='student' then aid=public.academic_learner(p_actor,'student');
 else raise exception 'Parents have read-only academic access.';end if;
 perform 1 from public.teaching_settings where singleton for update;
 select * into req from public.teaching_requests where id=rid;
 if req.id is not null then if req.actor_id<>p_actor or req.audience<>p_audience or req.operation<>'academic:'||p_operation or req.payload<>p_data then raise exception 'This request ID was already used for another operation.';end if;return req.result;end if;
 perform set_config('viva.teaching_actor',p_actor::text,true);perform set_config('viva.academic_request',rid::text,true);
 if p_audience='student' and p_operation not in ('attempt_start','draft_save','upload_prepare','upload_finalize','upload_resume','upload_discard','submit') then raise exception 'This academic operation is for staff.';end if;
 if p_operation in ('period_create','grade_publish','grade_reject','report_publish','memo_release') and p_audience<>'admin' then raise exception 'Administrator review is required.';end if;
 if attempt_id is not null then select * into att from public.academic_attempts where id=attempt_id for update;
  if att.id is null then raise exception 'Attempt not found.';end if;if tid is not null and tid<>att.task_id then raise exception 'Attempt and task do not match.';end if;tid=att.task_id;
 end if;
 if tid is not null then
  select * into t from public.academic_tasks where id=tid for update;if t.id is null then raise exception 'Task not found.';end if;
  if cid is not null and cid<>t.class_id then raise exception 'Task and class do not match.';end if;cid=t.class_id;
  if p_audience='student' then
   select * into r from public.academic_recipients where task_id=tid and application_id=aid;
   if r.application_id is null or t.state<>'assigned' or (att.id is not null and att.application_id<>aid) then raise exception 'This work is not assigned to your learner account.';end if;
  else perform public.teaching_access(p_actor,p_audience,cid);end if;
 end if;
 if cid is not null then select * into c from public.teaching_classes where id=cid;
  if c.id is null then raise exception 'Class not found.';end if;
  if c.archived and p_operation not in ('grade_save','grade_review','grade_publish','grade_reject','report_publish') then raise exception 'This class is archived.';end if;
 end if;
 if p_operation='period_create' then
  if c.id is null or (p_data->>'startsOn')::date<(make_date(c.season,2,1)) or (p_data->>'endsOn')::date>make_date(c.season,11,30) then raise exception 'Choose a reporting period within this class teaching season.';end if;
  insert into public.academic_periods(class_id,starts_on,ends_on,method) values(cid,(p_data->>'startsOn')::date,(p_data->>'endsOn')::date,p_data->>'method') returning to_jsonb(academic_periods.*) into result;
 elsif p_operation='task_create' then
  if c.id is null then raise exception 'Choose an assigned class.';end if;
  select * into p from public.academic_periods where id=(p_data->>'periodId')::uuid and class_id=cid;
  select * into tp from public.teaching_topics where id=(p_data->>'topicId')::uuid and grade=c.grade and subject=c.subject and active;
  if p.id is null or tp.id is null then raise exception 'Choose this class reporting period and learning topic.';end if;
  if p_data->>'sessionId' is not null and not exists(select 1 from public.teaching_sessions where id=(p_data->>'sessionId')::uuid and class_id=cid and status<>'cancelled') then raise exception 'Choose a non-cancelled session in this class.';end if;
  v_open=(p_data->>'opensAt')::timestamp at time zone 'Africa/Johannesburg';v_due=(p_data->>'dueAt')::timestamp at time zone 'Africa/Johannesburg';v_close=(p_data->>'closesAt')::timestamp at time zone 'Africa/Johannesburg';
  if (v_open at time zone 'Africa/Johannesburg')::date<p.starts_on or (v_close at time zone 'Africa/Johannesburg')::date>p.ends_on then raise exception 'Choose availability inside the selected reporting period.';end if;
  insert into public.academic_tasks(class_id,period_id,session_id,topic_id,title,topic_title,learning_goal,kind,purpose,format,instructions,submission_method,opens_at,due_at,closes_at,duration_minutes,max_marks,counts_average,weight,max_attempts,created_by)
   values(cid,p.id,(p_data->>'sessionId')::uuid,tp.id,coalesce(nullif(trim(p_data->>'title'),''),tp.title||' · '||(p_data->>'format')),tp.title,tp.goal,p_data->>'kind',p_data->>'purpose',p_data->>'format',trim(p_data->>'instructions'),p_data->>'submissionMethod',v_open,v_due,v_close,nullif(p_data->>'durationMinutes','')::integer,(p_data->>'maxMarks')::numeric,(p_data->>'countsAverage')::boolean,(p_data->>'weight')::numeric,(p_data->>'maxAttempts')::integer,p_actor) returning id into tid;
  if jsonb_array_length(coalesce(p_data->'resources','[]'))>20 then raise exception 'Attach at most 20 resource versions.';end if;
  for item in select value from jsonb_array_elements(coalesce(p_data->'resources','[]')) loop
   vid=(item->>'versionId')::uuid;
   if not exists(select 1 from public.teaching_material_versions v join public.teaching_materials m on m.id=v.material_id where v.id=vid and v.finalized_at is not null and not m.archived and m.grade=c.grade and m.subject=c.subject and (p_audience='admin' or m.owner_class_id=c.id or exists(select 1 from public.teaching_class_materials cm where cm.class_id=c.id and cm.version_id=v.id and cm.active))) then raise exception 'Choose verified resources belonging to this class.';end if;
   if (item->>'role'='memo' or p_data->>'kind'='exam') and (
    exists(select 1 from public.teaching_class_materials cm where cm.version_id=vid and cm.active and cm.learner_visible)
    or exists(select 1 from public.teaching_session_materials sm where sm.version_id=vid and sm.active and sm.learner_visible)
    or exists(select 1 from public.academic_resources ar join public.academic_tasks oldtask on oldtask.id=ar.task_id where ar.version_id=vid and oldtask.state='assigned' and oldtask.opens_at<=public.academic_now() and (ar.role='instructions' or oldtask.memo_released))
   ) then raise exception 'Choose a private, unreleased resource version for assessment papers or memoranda.';end if;
   insert into public.academic_resources values(tid,vid,item->>'role');
  end loop;
  result=jsonb_build_object('taskId',tid);
 elsif p_operation='task_assign' then
  if t.state<>'draft' or (p_data->>'revision')::integer is distinct from t.revision then raise exception 'Assign an unchanged draft task.';end if;
  if jsonb_typeof(p_data->'learners')<>'array' or jsonb_array_length(p_data->'learners') not between 1 and 100 then raise exception 'Choose between one and 100 eligible learners.';end if;
  for item in select value from jsonb_array_elements(p_data->'learners') loop
   if not exists(select 1 from public.teaching_memberships m join public.applications a on a.id=m.application_id where m.class_id=cid and m.application_id=(item#>>'{}')::uuid and m.joined_on<=(t.opens_at at time zone 'Africa/Johannesburg')::date and (m.left_on is null or m.left_on>(t.opens_at at time zone 'Africa/Johannesburg')::date) and a.status='active' and a.enrollment_state='active') then raise exception 'Choose active learners who belong to this class when the work opens.';end if;
   insert into public.academic_recipients(task_id,application_id,learner_name,student_number,starting_mark,target_mark) select tid,a.id,a.learner_name,l.student_number,s.current_mark,s.target_mark from public.applications a join public.learners l on l.application_id=a.id left join public.application_subjects s on s.application_id=a.id and s.subject_name=c.subject where a.id=(item#>>'{}')::uuid;
  end loop;
  update public.academic_tasks set state='assigned',revision=revision+1 where id=tid;
 elsif p_operation='task_cancel' then
  if length(reason)<5 or t.state='cancelled' or exists(select 1 from public.academic_attempts where task_id=tid and state<>'draft') then raise exception 'Cancel unused work with a reason; submitted work must retain its marking workflow.';end if;
  update public.academic_tasks set state='cancelled',revision=revision+1 where id=tid;
 elsif p_operation='extension' then
  if t.state<>'assigned' or t.memo_released or length(reason)<5 then raise exception 'Extend assigned work with a reason before releasing its memorandum.';end if;
  if t.kind='exam' and exists(select 1 from public.academic_resources ar where ar.task_id=tid and (exists(select 1 from public.teaching_class_materials cm where cm.version_id=ar.version_id and cm.active and cm.learner_visible) or exists(select 1 from public.teaching_session_materials sm where sm.version_id=ar.version_id and sm.active and sm.learner_visible))) then raise exception 'This assessment paper is already shared outside its task. Create a new private assessment instead of reopening it.';end if;
  v_close=(p_data->>'closesAt')::timestamp at time zone 'Africa/Johannesburg';
  select * into r from public.academic_recipients where task_id=tid and application_id=(p_data->>'applicationId')::uuid;
  if r.application_id is null or coalesce((p_data->>'extraMinutes')::integer,0)<r.extra_minutes or v_close<=coalesce(r.extended_closes_at,t.closes_at) or (v_close at time zone 'Africa/Johannesburg')::date>make_date(c.season,11,30) then raise exception 'Choose a later closing time within the teaching season for an assigned learner.';end if;
  update public.academic_recipients set extended_closes_at=v_close,extra_minutes=coalesce((p_data->>'extraMinutes')::integer,0) where task_id=tid and application_id=r.application_id;
 elsif p_operation='memo_release' then
  if t.state<>'assigned' or length(reason)<5 or exists(select 1 from public.academic_recipients where task_id=tid and coalesce(extended_closes_at,t.closes_at)>public.academic_now()) then raise exception 'Release a memorandum only after every learner closing time, with a reason.';end if;
  update public.academic_tasks set memo_released=true,revision=revision+1 where id=tid;
 elsif p_operation='attempt_start' then
  if p_audience<>'student' then raise exception 'Only the independently signed-in student can start work.';end if;
  if public.academic_now()<t.opens_at or public.academic_now()>=coalesce(r.extended_closes_at,t.closes_at) then raise exception 'This work is not open for submission.';end if;
  select * into att from public.academic_attempts where task_id=tid and application_id=aid order by attempt desc limit 1;
  if att.state='draft' then result=jsonb_build_object('attemptId',att.id);
  else
   if att.id is not null and (att.state<>'returned' or att.attempt>=t.max_attempts) then raise exception 'This work is already submitted or no further attempts are allowed.';end if;
   insert into public.academic_attempts(task_id,application_id,attempt,started_at) values(tid,aid,coalesce(att.attempt,0)+1,public.academic_now()) returning id into attempt_id;result=jsonb_build_object('attemptId',attempt_id);
  end if;
 elsif p_operation in ('draft_save','upload_prepare','upload_finalize','upload_resume','upload_discard','submit') then
  if p_audience<>'student' or att.id is null or att.state<>'draft' then raise exception 'Only the learner can change their unsubmitted draft.';end if;
  if public.academic_now()<t.opens_at or public.academic_now()>=public.academic_deadline(att.id) then raise exception 'The submission deadline has passed. Saved drafts remain recorded; request an authorized extension.';end if;
  if p_operation='upload_discard' then
   update public.academic_uploads set discarded=true where id=(p_data->>'id')::uuid and academic_uploads.attempt_id=att.id;
   if not found then raise exception 'Upload not found.';end if;
  elsif p_operation='upload_resume' then
   select * into up from public.academic_uploads where id=(p_data->>'id')::uuid and academic_uploads.attempt_id=att.id and not discarded and finalized_at is null;
   if up.id is null or up.file_name is distinct from p_data->>'name' or up.size_bytes is distinct from (p_data->>'size')::integer or up.mime is distinct from p_data->>'mime' then raise exception 'Choose the original pending file with its recorded name, size and type.';end if;result=to_jsonb(up);
  elsif p_operation in ('draft_save','submit') then
   if (p_data->>'revision')::integer is distinct from att.revision then raise exception 'This draft changed. Refresh before saving.';end if;
   if p_operation='submit' then
    if t.submission_method in ('text','both') and length(trim(coalesce(p_data->>'answer',att.answer)))=0 then raise exception 'Add your answer before submitting.';end if;
    if t.submission_method in ('file','both') and not exists(select 1 from public.academic_uploads where academic_uploads.attempt_id=att.id and finalized_at is not null and not discarded) then raise exception 'Upload and verify a required file before submitting.';end if;
    if exists(select 1 from public.academic_uploads where academic_uploads.attempt_id=att.id and finalized_at is null and not discarded) then raise exception 'Verify every pending upload before submitting.';end if;
   end if;
   update public.academic_attempts set answer=coalesce(p_data->>'answer',answer),revision=revision+1,state=case when p_operation='submit' then 'submitted' else 'draft' end,
    submitted_at=case when p_operation='submit' then public.academic_now() else null end,receipt=case when p_operation='submit' then gen_random_uuid() else null end,late=p_operation='submit' and public.academic_now()>t.due_at where id=att.id returning * into att;
   result=jsonb_build_object('attemptId',att.id,'revision',att.revision,'receipt',att.receipt,'submittedAt',att.submitted_at);
  elsif p_operation='upload_prepare' then
   if t.submission_method='text' or (select count(*) from public.academic_uploads where academic_uploads.attempt_id=att.id and not discarded)>=3 then raise exception 'Choose a file-enabled task with fewer than three uploads.';end if;
   insert into public.academic_uploads(id,attempt_id,file_name,storage_path,mime,size_bytes) values((p_data->>'id')::uuid,att.id,p_data->>'name',att.id||'/'||(p_data->>'id')||case p_data->>'mime' when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_data->>'mime',(p_data->>'size')::integer) returning * into up;result=to_jsonb(up);
  else
   select * into up from public.academic_uploads where id=(p_data->>'id')::uuid and academic_uploads.attempt_id=att.id and not discarded;
   if up.id is null then raise exception 'Upload not found in this draft.';end if;
   if not exists(select 1 from storage.buckets where id='academic-submissions' and not public) then raise exception 'Submission storage must remain private.';end if;
   select metadata into meta from storage.objects where bucket_id='academic-submissions' and name=up.storage_path;
   if meta is null or coalesce(meta->>'size','')!~'^[0-9]+$' or (meta->>'size')::bigint<>up.size_bytes or lower(split_part(coalesce(meta->>'mimetype',''),';',1))<>up.mime then raise exception 'The uploaded file size and type could not be verified.';end if;
   update public.academic_uploads set finalized_at=coalesce(finalized_at,public.academic_now()) where id=up.id;result=jsonb_build_object('id',up.id);
  end if;
 elsif p_operation='attempt_return' then
  if att.id is null or att.state<>'submitted' or t.kind='exam' or att.attempt>=t.max_attempts or length(reason)<5 or exists(select 1 from public.academic_grades where academic_grades.attempt_id=att.id) then raise exception 'Return unmarked homework with a reason only when another attempt is permitted.';end if;
  update public.academic_attempts set state='returned',return_reason=reason,revision=revision+1 where id=att.id;
 elsif p_operation='grade_save' then
  if att.id is null or att.state<>'submitted' then raise exception 'Select a confirmed learner submission before marking.';end if;
  select coalesce(max(revision),0) into latest from public.academic_grades where task_id=tid and application_id=att.application_id;
  if latest is distinct from (p_data->>'revision')::integer then raise exception 'Marking changed. Refresh before saving.';end if;
  if latest>0 and length(reason)<5 then raise exception 'Give a reason for revising a mark.';end if;
  if (p_data->>'score')::numeric>t.max_marks then raise exception 'The score exceeds the maximum marks.';end if;
  insert into public.academic_grades(task_id,application_id,attempt_id,revision,score,feedback,staff_note,reason,marked_by) values(tid,att.application_id,att.id,latest+1,(p_data->>'score')::numeric,trim(p_data->>'feedback'),coalesce(p_data->>'staffNote',''),reason,p_actor) returning id into vid;result=jsonb_build_object('gradeId',vid);
 elsif p_operation in ('grade_review','grade_publish','grade_reject') then
  select * into g from public.academic_grades where id=(p_data->>'gradeId')::uuid and task_id=tid for update;
  if g.id is null or g.revision<>(select max(revision) from public.academic_grades where task_id=tid and application_id=g.application_id) then raise exception 'Select the latest mark revision.';end if;
  if p_operation='grade_review' then
   if g.state<>'draft' then raise exception 'Submit a draft mark for review.';end if;update public.academic_grades set state='review' where id=g.id;
  elsif p_operation='grade_publish' then
   if g.state<>'review' then raise exception 'Only reviewed marks can be published.';end if;update public.academic_grades set state='published',published_by=p_actor,published_at=public.academic_now() where id=g.id;
  else
   if g.state<>'review' or length(reason)<5 then raise exception 'Return a pending review with a reason.';end if;update public.academic_grades set state='rejected',reason=reason where id=g.id;
  end if;
 elsif p_operation='report_publish' then
  select * into p from public.academic_periods where id=(p_data->>'periodId')::uuid and class_id=cid;
  aid=(p_data->>'applicationId')::uuid;
  if p.id is null or length(reason)<5 or not exists(select 1 from public.academic_recipients ar join public.academic_tasks task on task.id=ar.task_id where ar.application_id=aid and task.period_id=p.id) then raise exception 'Choose a learner with work in this period and a publication reason.';end if;
  result=public.academic_progress(aid,p.id);
  if p_data->>'fingerprint' is distinct from result->>'fingerprint' then raise exception 'Progress changed. Refresh and review the current calculation before publishing.';end if;
  result=result||(select jsonb_build_object('learnerName',a.learner_name,'studentNumber',l.student_number,'className',c.name) from public.applications a join public.learners l on l.application_id=a.id where a.id=aid);
  insert into public.academic_reports(period_id,application_id,content,reason,created_by) values(p.id,aid,result,reason,p_actor) returning id into vid;result=jsonb_build_object('reportId',vid);
 else raise exception 'Unknown academic operation.';end if;
 insert into public.teaching_events(actor_id,action,class_id,details) values(p_actor,'academic:'||p_operation,cid,jsonb_build_object('requestId',rid,'taskId',tid,'attemptId',attempt_id,'reason',reason));
 insert into public.teaching_requests values(rid,p_actor,p_audience,'academic:'||p_operation,p_data,result,now());return result;
end $$;

create or replace function public.academic_snapshot(p_actor uuid,p_audience text,p_application uuid default null,p_task uuid default null,p_class uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare aid uuid;ids uuid[];tasks uuid[];attempts uuid[];staff boolean=p_audience in ('admin','tutor');result jsonb;
begin
 if staff then
  perform public.teaching_access(p_actor,p_audience);
  select coalesce(array_agg(id),'{}') into ids from public.teaching_classes where (p_class is null or id=p_class) and (p_audience='admin' or (tutor_id=(select id from public.tutor_assert(p_actor)) and not archived));
 else aid=public.academic_learner(p_actor,p_audience,p_application);
  select coalesce(array_agg(distinct t.class_id),'{}') into ids from public.academic_recipients r join public.academic_tasks t on t.id=r.task_id where r.application_id=aid;
 end if;
 select coalesce(array_agg(t.id),'{}') into tasks from public.academic_tasks t where t.class_id=any(ids) and (staff or (t.state<>'draft' and exists(select 1 from public.academic_recipients r where r.task_id=t.id and r.application_id=aid)));
 if cardinality(tasks)>1000 then raise exception 'Contact Viva for an extended academic record export; more than 1000 tasks are available.';end if;
 select coalesce(array_agg(a.id),'{}') into attempts from public.academic_attempts a where a.task_id=any(tasks) and (case when staff then a.state<>'draft' else a.application_id=aid end);
 result=jsonb_build_object('now',public.academic_now(),'audience',p_audience,
 'periods',(select coalesce(jsonb_agg(to_jsonb(p) order by starts_on),'[]') from public.academic_periods p where class_id=any(ids)),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(t)-'created_by'||jsonb_build_object('class_archived',(select archived from public.teaching_classes where id=t.class_id))||case when not staff and public.academic_now()<t.opens_at then jsonb_build_object('instructions','This work has not opened yet.') else '{}'::jsonb end order by t.created_at desc),'[]') from public.academic_tasks t where id=any(tasks)),
 'recipients',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.academic_recipients r where task_id=any(tasks) and (staff or application_id=aid)),
 'attempts',(select coalesce(jsonb_agg((to_jsonb(a)-'answer')||jsonb_build_object('answer',case when a.task_id=p_task then a.answer else null end,'deadline',public.academic_deadline(a.id)) order by attempt desc),'[]') from public.academic_attempts a where id=any(attempts)),
 'uploads',(select coalesce(jsonb_agg(to_jsonb(u)-'storage_path'),'[]') from public.academic_uploads u where attempt_id=any(attempts) and not discarded),
 'grades',case when staff then (select coalesce(jsonb_agg(to_jsonb(g) order by revision desc),'[]') from public.academic_grades g where task_id=any(tasks))
  else (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'task_id',g.task_id,'application_id',g.application_id,'attempt_id',g.attempt_id,'revision',g.revision,'score',g.score,'feedback',g.feedback,'state',g.state,'published_at',g.published_at) order by g.published_at desc,g.revision desc),'[]') from public.academic_grades g where g.task_id=any(tasks) and g.application_id=aid and g.state='published') end,
 'resources',(select coalesce(jsonb_agg(jsonb_build_object('task_id',r.task_id,'version_id',r.version_id,'role',r.role,'name',v.file_name,'mime',v.mime,'version',v.version)),'[]') from public.academic_resources r join public.academic_tasks t on t.id=r.task_id join public.teaching_material_versions v on v.id=r.version_id where r.task_id=any(tasks) and (staff or (t.state='assigned' and public.academic_now()>=t.opens_at and (r.role='instructions' or t.memo_released)))),
 'progress',case when staff then (select coalesce(jsonb_agg(public.academic_progress(q.application_id,q.period_id)||jsonb_build_object('applicationId',q.application_id,'learnerName',q.learner_name)),'[]') from(select distinct r.application_id,t.period_id,r.learner_name from public.academic_recipients r join public.academic_tasks t on t.id=r.task_id where t.class_id=any(ids))q) else (select coalesce(jsonb_agg(public.academic_progress(aid,p.id)),'[]') from public.academic_periods p where class_id=any(ids)) end,
 'reports',(select coalesce(jsonb_agg(to_jsonb(r)-'created_by' order by r.created_at desc),'[]') from public.academic_reports r join public.academic_periods p on p.id=r.period_id where p.class_id=any(ids) and (staff or r.application_id=aid)));
 return result;
end $$;
create or replace function public.academic_file(p_actor uuid,p_audience text,p_id uuid,p_kind text,p_application uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snap jsonb;result jsonb;
begin
 snap=public.academic_snapshot(p_actor,p_audience,p_application);
 if p_kind='resource' then
  if not exists(select 1 from jsonb_array_elements(snap->'resources') x where x->>'version_id'=p_id::text) then raise exception 'This academic resource is not released to your account.';end if;
  select to_jsonb(v)||jsonb_build_object('bucket','teaching-materials') into result from public.teaching_material_versions v where id=p_id and finalized_at is not null;
 elsif p_kind='submission' then
  if not exists(select 1 from jsonb_array_elements(snap->'uploads') x where x->>'id'=p_id::text and x->>'finalized_at' is not null and x->>'discarded'='false') then raise exception 'This submission file is not available to your account.';end if;
  select to_jsonb(u)||jsonb_build_object('bucket','academic-submissions') into result from public.academic_uploads u where id=p_id and finalized_at is not null;
 else raise exception 'Unknown academic file kind.';end if;
 if result is null then raise exception 'Verified academic file not found.';end if;return result;
end $$;
create or replace function public.academic_report(p_actor uuid,p_audience text,p_id uuid,p_application uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.academic_reports;cid uuid;aid uuid;
begin
 select * into r from public.academic_reports where id=p_id;
 if r.id is null then raise exception 'Report not found.';end if;
 if p_audience in ('admin','tutor') then select class_id into cid from public.academic_periods where id=r.period_id;perform public.teaching_access(p_actor,p_audience,cid);
 else aid=public.academic_learner(p_actor,p_audience,p_application);if aid<>r.application_id then raise exception 'This report does not belong to your learner account.';end if;end if;
 return jsonb_build_object('id',r.id,'content',r.content,'created_at',r.created_at);
end $$;
revoke all on function public.academic_track(),public.academic_learner(uuid,text,uuid),public.academic_deadline(uuid),public.academic_progress(uuid,uuid),public.academic_mutate(uuid,text,text,jsonb),public.academic_snapshot(uuid,text,uuid,uuid,uuid),public.academic_file(uuid,text,uuid,text,uuid),public.academic_report(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.academic_mutate(uuid,text,text,jsonb),public.academic_snapshot(uuid,text,uuid,uuid,uuid),public.academic_file(uuid,text,uuid,text,uuid),public.academic_report(uuid,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';

-- Protect alternate class/session download paths as well as the academic API.
create or replace function public.academic_guard_release() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active and new.learner_visible and exists(
  select 1 from public.academic_resources ar join public.academic_tasks task on task.id=ar.task_id
  where ar.version_id=new.version_id and task.state<>'cancelled' and (
   (ar.role='memo' and not task.memo_released)
   or (ar.role='instructions' and task.kind='exam' and greatest(task.closes_at,coalesce((select max(r.extended_closes_at) from public.academic_recipients r where r.task_id=task.id),task.closes_at))>public.academic_now())
  )
 ) then raise exception 'This version is protected by an academic task. Share it through the task and release memoranda through admin after closing.';end if;
 return new;
end $$;
drop trigger if exists academic_release_guard on public.teaching_class_materials;
create trigger academic_release_guard before insert or update on public.teaching_class_materials for each row execute function public.academic_guard_release();
drop trigger if exists academic_release_guard on public.teaching_session_materials;
create trigger academic_release_guard before insert or update on public.teaching_session_materials for each row execute function public.academic_guard_release();
revoke all on function public.academic_guard_release() from public,anon,authenticated;
