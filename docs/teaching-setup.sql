-- Complete teaching release 1 upgrade. Run ALL of this file after parent setup.
begin;

-- BEGIN TEACHING FOUNDATION
-- Teaching release 1: private classes, sessions, resources and attendance.
do $$ begin
 if to_regprocedure('public.parent_scope(uuid)') is null then raise exception 'Apply the parent portal setup before teaching setup.'; end if;
end $$;
create table if not exists public.teaching_settings(singleton boolean primary key default true check(singleton));
insert into public.teaching_settings values(true) on conflict do nothing;
create table if not exists public.teaching_tutors(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 120),
 email text not null unique check(email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 user_id uuid unique references auth.users(id) on delete set null, enabled boolean not null default true,
 created_at timestamptz not null default now(), last_signed_in_at timestamptz
);
create table if not exists public.teaching_venues(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 120),
 mode text not null check(mode in ('Online','In-person')), detail text not null check(length(trim(detail)) between 3 and 1000),
 active boolean not null default true, check(mode<>'Online' or detail ~ '^https://[^[:space:]]+$')
);
create table if not exists public.teaching_topics(
 id uuid primary key default gen_random_uuid(), grade text not null references public.tuition_programmes(grade),
 subject text not null check(length(subject) between 2 and 100), title text not null check(length(trim(title)) between 2 and 160),
 goal text not null check(length(trim(goal)) between 5 and 600), active boolean not null default true,
 unique(grade,subject,title)
);
create table if not exists public.teaching_classes(
 id uuid primary key default gen_random_uuid(), name text not null, grade text not null references public.tuition_programmes(grade),
 subject text not null, group_name text not null check(group_name ~ '^[A-L]$'), season integer not null check(season between 2026 and 2100),
 tutor_id uuid not null references public.teaching_tutors(id), venue_id uuid not null references public.teaching_venues(id),
 weekdays smallint[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
 starts_at time not null, ends_at time not null, archived boolean not null default false,
 created_at timestamptz not null default now(), check(ends_at>starts_at), unique(grade,subject,group_name,season)
);
create table if not exists public.teaching_memberships(
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.teaching_classes(id), application_id uuid not null references public.applications(id),
 joined_on date not null, left_on date, unique(class_id,application_id,joined_on), check(left_on is null or left_on>=joined_on)
);
create unique index if not exists teaching_membership_current on public.teaching_memberships(class_id,application_id) where left_on is null;
create table if not exists public.teaching_sessions(
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.teaching_classes(id),
 topic_id uuid not null references public.teaching_topics(id), topic_title text not null, learning_goal text not null,
 tutor_id uuid not null references public.teaching_tutors(id), venue_name text not null, venue_detail text not null, mode text not null,
 starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 outcome text check(outcome in ('Objective covered','More practice needed','Follow-up planned')), staff_note text not null default '',
 cancel_reason text, revision integer not null default 0, created_at timestamptz not null default now(),
 check(ends_at>starts_at), check(length(staff_note)<=2000)
);
create index if not exists teaching_sessions_class on public.teaching_sessions(class_id,starts_at);
create table if not exists public.teaching_session_roster(
 session_id uuid not null references public.teaching_sessions(id), application_id uuid not null references public.applications(id),
 learner_name text not null, student_number text not null, starting_mark numeric(5,2), target_mark numeric(5,2),
 included boolean not null default true, attendance text check(attendance in ('present','late','absent','excused')),
 recorded_by uuid references auth.users(id), recorded_at timestamptz, primary key(session_id,application_id)
);
create index if not exists teaching_roster_learner on public.teaching_session_roster(application_id,session_id);
create table if not exists public.teaching_materials(
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 2 and 180),
 grade text not null references public.tuition_programmes(grade), subject text not null,
 kind text not null check(kind in ('Notes','Worksheet','Presentation','Question paper','Memorandum','Revision')),
 archived boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.teaching_material_versions(
 id uuid primary key, material_id uuid not null references public.teaching_materials(id), version integer not null check(version>0),
 file_name text not null check(length(file_name) between 1 and 200), storage_path text not null unique,
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 size_bytes integer not null check(size_bytes between 1 and 10485760), finalized_at timestamptz,
 created_at timestamptz not null default now(), unique(material_id,version)
);
create table if not exists public.teaching_class_materials(
 class_id uuid not null references public.teaching_classes(id), version_id uuid not null references public.teaching_material_versions(id),
 active boolean not null default true, primary key(class_id,version_id)
);
create table if not exists public.teaching_session_materials(
 session_id uuid not null references public.teaching_sessions(id), version_id uuid not null references public.teaching_material_versions(id),
 active boolean not null default true, primary key(session_id,version_id)
);
create table if not exists public.teaching_events(
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id), action text not null,
 class_id uuid references public.teaching_classes(id), session_id uuid references public.teaching_sessions(id),
 details jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.teaching_requests(
 id uuid primary key, actor_id uuid not null references auth.users(id), audience text not null, operation text not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('teaching-materials','teaching-materials',false,10485760,array['application/pdf','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.teaching_now() returns timestamptz language sql stable set search_path='' as $$select now()$$;
create or replace function public.tutor_signin_allowed(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teaching_tutors where email=lower(trim(p_email)) and enabled);
$$;
create or replace function public.tutor_assert(p_user uuid) returns public.teaching_tutors language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors; v_email text; v_confirmed timestamptz;
begin
 select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user;
 select * into t from public.teaching_tutors where user_id=p_user and email=v_email and enabled;
 if t.id is null or v_confirmed is null then raise exception 'Tutor access is unavailable. Contact Viva Tutorials.'; end if; return t;
end $$;
create or replace function public.tutor_bind(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.teaching_tutors; v_email text; v_confirmed timestamptz;
begin
 select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user;
 if v_confirmed is null then raise exception 'Verify your tutor email before signing in.'; end if;
 select * into t from public.teaching_tutors where email=v_email and enabled for update;
 if t.id is null or (t.user_id is not null and t.user_id<>p_user) then raise exception 'Tutor access is unavailable. Contact Viva Tutorials.'; end if;
 perform set_config('viva.teaching_actor',p_user::text,true);
 update public.teaching_tutors set user_id=p_user,last_signed_in_at=now() where id=t.id;
 return jsonb_build_object('id',p_user,'email',v_email,'name',t.name);
end $$;
create or replace function public.teaching_access(p_user uuid,p_audience text,p_class uuid default null) returns void language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors;
begin
 if p_audience='admin' then perform public.admin_assert(p_user);
 elsif p_audience='tutor' then
  t=public.tutor_assert(p_user);
  if p_class is not null and not exists(select 1 from public.teaching_classes where id=p_class and tutor_id=t.id and not archived) then raise exception 'This class is not assigned to you.'; end if;
 else raise exception 'Invalid teaching access.'; end if;
end $$;
create or replace function public.teaching_track_change() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; c uuid; s uuid;
begin
 if tg_op='DELETE' then raise exception 'Teaching history cannot be deleted. Archive or correct the record.'; end if;
 actor=nullif(current_setting('viva.teaching_actor',true),'')::uuid;
 if actor is null then raise exception 'Use an authorized teaching operation so its history is recorded.'; end if;
 if tg_table_name='teaching_classes' then c=new.id;
 elsif tg_table_name='teaching_sessions' then c=new.class_id; s=new.id;
 elsif tg_table_name in ('teaching_memberships','teaching_class_materials') then c=new.class_id;
 elsif tg_table_name in ('teaching_session_roster','teaching_session_materials') then s=new.session_id;select class_id into c from public.teaching_sessions where id=s;
 end if;
 insert into public.teaching_events(actor_id,action,class_id,session_id,details) values(actor,tg_table_name||':'||lower(tg_op),c,s,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;
create or replace function public.teaching_history_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Teaching audit and request history is immutable.'; end $$;
do $$ declare n text; begin
 foreach n in array array['teaching_tutors','teaching_venues','teaching_topics','teaching_classes','teaching_memberships','teaching_sessions','teaching_session_roster','teaching_materials','teaching_material_versions','teaching_class_materials','teaching_session_materials'] loop
  execute format('drop trigger if exists teaching_track on public.%I',n);
  execute format('create trigger teaching_track after insert or update or delete on public.%I for each row execute function public.teaching_track_change()',n);
 end loop;
 foreach n in array array['teaching_events','teaching_requests'] loop
  execute format('drop trigger if exists teaching_immutable on public.%I',n);
  execute format('create trigger teaching_immutable before update or delete on public.%I for each row execute function public.teaching_history_immutable()',n);
 end loop;
 foreach n in array array['teaching_settings','teaching_tutors','teaching_venues','teaching_topics','teaching_classes','teaching_memberships','teaching_sessions','teaching_session_roster','teaching_materials','teaching_material_versions','teaching_class_materials','teaching_session_materials','teaching_events','teaching_requests'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant all on public.%I to service_role',n);
 end loop;
end $$;
revoke all on function public.teaching_now(),public.tutor_signin_allowed(text),public.tutor_assert(uuid),public.tutor_bind(uuid),public.teaching_access(uuid,text,uuid),public.teaching_track_change(),public.teaching_history_immutable() from public,anon,authenticated;
grant execute on function public.tutor_signin_allowed(text),public.tutor_assert(uuid),public.tutor_bind(uuid) to service_role;


create or replace function public.teaching_mutate(p_actor uuid,p_audience text,p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare req public.teaching_requests; rid uuid=(p_data->>'requestId')::uuid; cid uuid=(p_data->>'classId')::uuid;
 sid uuid=(p_data->>'sessionId')::uuid; id uuid=(p_data->>'id')::uuid; vid uuid=(p_data->>'versionId')::uuid;
 c public.teaching_classes; s public.teaching_sessions; t public.teaching_tutors; topic public.teaching_topics; venue public.teaching_venues;
 mat public.teaching_materials; ver public.teaching_material_versions; a public.applications; e public.teaching_session_roster;
 result jsonb='{}'; day date; start_t time; end_t time; ds smallint[]; item jsonb; n integer; meta jsonb; reason text=trim(coalesce(p_data->>'reason',''));
begin
 if rid is null then raise exception 'A stable request ID is required.'; end if;
 perform public.teaching_access(p_actor,p_audience,cid);
 perform 1 from public.teaching_settings where singleton for update;
 select * into req from public.teaching_requests where teaching_requests.id=rid;
 if req.id is not null then
  if req.actor_id<>p_actor or req.audience<>p_audience or req.operation<>p_operation or req.payload<>p_data then raise exception 'This request ID was already used for another operation.'; end if; return req.result;
 end if;
 perform set_config('viva.teaching_actor',p_actor::text,true);
 if p_operation not in ('attendance','session_finish','session_material') and p_audience<>'admin' then raise exception 'Only administrators can change teaching setup.'; end if;
 if sid is not null then
  select * into s from public.teaching_sessions where teaching_sessions.id=sid for update;
  if s.id is null then raise exception 'Session not found.'; end if;
  perform public.teaching_access(p_actor,p_audience,s.class_id);
  if cid is not null and cid<>s.class_id then raise exception 'Session and class do not match.'; end if; cid=s.class_id;
 end if;
 if cid is not null then
  select * into c from public.teaching_classes where teaching_classes.id=cid;
  if c.id is null then raise exception 'Class not found.'; end if;
  if c.archived and p_operation<>'class_update' then raise exception 'This class is archived.'; end if;
 end if;
 if p_operation='tutor_save' then
  if id is null then
   insert into public.teaching_tutors(name,email) values(trim(p_data->>'name'),lower(trim(p_data->>'email'))) returning teaching_tutors.id into id;
  else
   if length(reason)<5 then raise exception 'Choose a reason for changing tutor access.'; end if;
   update public.teaching_tutors set enabled=(p_data->>'enabled')::boolean where teaching_tutors.id=id;
   if not found then raise exception 'Tutor not found.'; end if;
  end if; result=jsonb_build_object('id',id);
 elsif p_operation='venue_create' then
  insert into public.teaching_venues(name,mode,detail) values(trim(p_data->>'name'),p_data->>'mode',trim(p_data->>'detail')) returning teaching_venues.id into id;result=jsonb_build_object('id',id);
 elsif p_operation='topic_create' then
  if p_data->>'subject' not in ('Mathematics','Natural Sciences','Other academic support','Mathematical Literacy','Physical Sciences','Life Sciences') then raise exception 'Choose an enrollment subject.'; end if;
  insert into public.teaching_topics(grade,subject,title,goal) values(p_data->>'grade',p_data->>'subject',trim(p_data->>'title'),trim(p_data->>'goal')) returning teaching_topics.id into id;result=jsonb_build_object('id',id);
 elsif p_operation='class_create' then
  select * into t from public.teaching_tutors where teaching_tutors.id=(p_data->>'tutorId')::uuid and enabled;
  select * into venue from public.teaching_venues where teaching_venues.id=(p_data->>'venueId')::uuid and active;
  select array_agg(value::smallint) into ds from jsonb_array_elements_text(p_data->'weekdays');
  if t.id is null or venue.id is null or ds is null or not exists(select 1 from public.tuition_programmes where grade=p_data->>'grade' and ds<@weekdays) then raise exception 'Choose an enabled tutor, venue and valid programme days.'; end if;
  if p_data->>'subject' not in ('Mathematics','Natural Sciences','Other academic support','Mathematical Literacy','Physical Sciences','Life Sciences') then raise exception 'Choose an enrollment subject.'; end if;
  insert into public.teaching_classes(name,grade,subject,group_name,season,tutor_id,venue_id,weekdays,starts_at,ends_at)
   values((p_data->>'grade')||' · '||(p_data->>'subject')||' · Group '||(p_data->>'group'),p_data->>'grade',p_data->>'subject',p_data->>'group',(p_data->>'season')::integer,t.id,venue.id,ds,(p_data->>'startTime')::time,(p_data->>'endTime')::time) returning teaching_classes.id into id;
  result=jsonb_build_object('id',id);
 elsif p_operation='class_update' then
  if c.id is null or length(reason)<5 then raise exception 'Choose a class and a reason.'; end if;
  if p_data ? 'tutorId' then
   if not exists(select 1 from public.teaching_tutors where teaching_tutors.id=(p_data->>'tutorId')::uuid and enabled) then raise exception 'Choose an enabled tutor.'; end if;
   if exists(select 1 from public.teaching_sessions ss join public.teaching_sessions other on other.tutor_id=(p_data->>'tutorId')::uuid and other.class_id<>cid and other.status<>'cancelled' and other.starts_at<ss.ends_at and other.ends_at>ss.starts_at where ss.class_id=cid and ss.status='scheduled' and ss.starts_at>public.teaching_now()) then raise exception 'The new tutor has a conflicting future session.'; end if;
   update public.teaching_sessions set tutor_id=(p_data->>'tutorId')::uuid,revision=revision+1 where class_id=cid and status='scheduled' and starts_at>public.teaching_now();
   update public.teaching_classes set tutor_id=(p_data->>'tutorId')::uuid where teaching_classes.id=cid;
  end if;
  if coalesce((p_data->>'archived')::boolean,false) then update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where class_id=cid and status='scheduled' and starts_at>public.teaching_now(); end if;
  if p_data ? 'archived' then update public.teaching_classes set archived=(p_data->>'archived')::boolean where teaching_classes.id=cid;end if;
 elsif p_operation='membership' then
  if c.id is null then raise exception 'Choose a class.'; end if;
  day=(p_data->>'day')::date;
  if day is null or extract(year from day)<>c.season or extract(month from day) not between 2 and 11 then raise exception 'Choose an effective date in this teaching season.'; end if;
  if p_data->>'change'='add' then
   if jsonb_typeof(p_data->'learners')<>'array' or jsonb_array_length(p_data->'learners') not between 1 and 100 then raise exception 'Select between one and 100 learners.'; end if;
   if (select count(*) from public.teaching_memberships where class_id=cid and left_on is null)+jsonb_array_length(p_data->'learners')>100 then raise exception 'A class can have at most 100 current learners.'; end if;
   for item in select value from jsonb_array_elements(p_data->'learners') loop
    select * into a from public.applications where applications.id=(item#>>'{}')::uuid;
    if a.id is null or a.status<>'active' or a.enrollment_state<>'active' or a.grade_level<>c.grade or not(c.subject=any(a.selected_subjects)) then raise exception 'Select active learners enrolled in this grade and subject.'; end if;
    if exists(select 1 from public.teaching_memberships where class_id=cid and application_id=a.id and (left_on is null or left_on>day)) then raise exception 'This learner has an overlapping membership period.'; end if;
    if exists(select 1 from public.teaching_sessions mine join public.teaching_sessions other on other.class_id<>cid and other.status<>'cancelled' and other.starts_at<mine.ends_at and other.ends_at>mine.starts_at join public.teaching_session_roster other_r on other_r.session_id=other.id and other_r.application_id=a.id and other_r.included where mine.class_id=cid and mine.status='scheduled' and (mine.starts_at at time zone 'Africa/Johannesburg')::date>=day) then raise exception 'This learner has an overlapping session in another class.'; end if;
    if exists(select 1 from public.teaching_memberships where class_id=cid and application_id=a.id and joined_on=day) then raise exception 'A membership period already starts on this date. Choose a later return date.'; end if;
    insert into public.teaching_memberships(class_id,application_id,joined_on) values(cid,a.id,day);
    insert into public.teaching_session_roster(session_id,application_id,learner_name,student_number,starting_mark,target_mark)
     select ss.id,a.id,a.learner_name,l.student_number,m.current_mark,m.target_mark from public.teaching_sessions ss join public.learners l on l.application_id=a.id left join public.application_subjects m on m.application_id=a.id and m.subject_name=c.subject
     where ss.class_id=cid and ss.status='scheduled' and (ss.starts_at at time zone 'Africa/Johannesburg')::date>=day on conflict(session_id,application_id) do update set included=true where public.teaching_session_roster.attendance is null;
   end loop;
  elsif p_data->>'change'='remove' then
   if length(reason)<5 then raise exception 'Choose a reason for ending class membership.'; end if;
   update public.teaching_memberships set left_on=day where class_id=cid and application_id=(p_data->>'applicationId')::uuid and left_on is null;
   if not found then raise exception 'Active class membership not found.'; end if;
   update public.teaching_session_roster rr set included=false from public.teaching_sessions ss where rr.session_id=ss.id and ss.class_id=cid and ss.status='scheduled' and rr.application_id=(p_data->>'applicationId')::uuid and (ss.starts_at at time zone 'Africa/Johannesburg')::date>=day and rr.attendance is null;
  else raise exception 'Choose add or remove membership.'; end if;
 elsif p_operation='session_create' then
  day=(p_data->>'day')::date;start_t=coalesce(nullif(p_data->>'startTime','')::time,c.starts_at);end_t=coalesce(nullif(p_data->>'endTime','')::time,c.ends_at);
  select * into topic from public.teaching_topics where teaching_topics.id=(p_data->>'topicId')::uuid and active;
  select * into venue from public.teaching_venues where teaching_venues.id=c.venue_id and active;
  if c.id is null or day is null or topic.id is null or topic.grade<>c.grade or topic.subject<>c.subject or venue.id is null or not exists(select 1 from public.teaching_tutors where teaching_tutors.id=c.tutor_id and enabled) then raise exception 'Choose a class with an enabled tutor, venue and matching topic.'; end if;
  if extract(year from day)<>c.season or extract(month from day) not between 2 and 11 or not(extract(isodow from day)::smallint=any(c.weekdays)) or exists(select 1 from public.tuition_closures where tuition_closures.day=day) then raise exception 'Choose a scheduled day in the teaching season that is not a closure.'; end if;
  if end_t<=start_t then raise exception 'Session end must be after its start.'; end if;
  if exists(select 1 from public.teaching_sessions x where x.status<>'cancelled' and (x.tutor_id=c.tutor_id or x.class_id=cid or (x.mode=venue.mode and x.venue_detail=venue.detail and (venue.mode='Online' or x.venue_name=venue.name))) and x.starts_at<((day+end_t) at time zone 'Africa/Johannesburg') and x.ends_at>((day+start_t) at time zone 'Africa/Johannesburg')) then raise exception 'This time overlaps an existing class, tutor or classroom session.'; end if;
  if exists(select 1 from public.teaching_memberships mm join public.applications a0 on a0.id=mm.application_id join public.teaching_session_roster rr on rr.application_id=mm.application_id and rr.included join public.teaching_sessions other on other.id=rr.session_id and other.status<>'cancelled' where mm.class_id=cid and mm.joined_on<=day and (mm.left_on is null or mm.left_on>day) and a0.status='active' and a0.enrollment_state='active' and other.starts_at<((day+end_t) at time zone 'Africa/Johannesburg') and other.ends_at>((day+start_t) at time zone 'Africa/Johannesburg')) then raise exception 'A learner already has a session at this time.'; end if;
  insert into public.teaching_sessions(class_id,topic_id,topic_title,learning_goal,tutor_id,venue_name,venue_detail,mode,starts_at,ends_at)
   values(cid,topic.id,topic.title,topic.goal,c.tutor_id,venue.name,venue.detail,venue.mode,(day+start_t) at time zone 'Africa/Johannesburg',(day+end_t) at time zone 'Africa/Johannesburg') returning teaching_sessions.id into sid;
  insert into public.teaching_session_roster(session_id,application_id,learner_name,student_number,starting_mark,target_mark)
   select sid,a0.id,a0.learner_name,l.student_number,m.current_mark,m.target_mark from public.teaching_memberships mm join public.applications a0 on a0.id=mm.application_id join public.learners l on l.application_id=a0.id left join public.application_subjects m on m.application_id=a0.id and m.subject_name=c.subject
   where mm.class_id=cid and mm.joined_on<=day and (mm.left_on is null or mm.left_on>day) and a0.status='active' and a0.enrollment_state='active';
  insert into public.teaching_session_materials(session_id,version_id) select sid,version_id from public.teaching_class_materials where class_id=cid and active;
  result=jsonb_build_object('sessionId',sid);
 elsif p_operation='attendance' then
  if s.id is null or s.status='cancelled' or s.starts_at>public.teaching_now() then raise exception 'Record attendance only after a non-cancelled session starts.'; end if;
  if (p_data->>'revision')::integer is distinct from s.revision then raise exception 'This register changed. Refresh before saving.'; end if;
  if exists(select 1 from public.teaching_session_roster where session_id=sid and attendance is not null) and length(reason)<5 then raise exception 'Choose a correction reason for a completed register.'; end if;
  select count(*) into n from public.teaching_session_roster where session_id=sid and included;
  if n=0 or jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows')<>n or (select count(distinct value->>'applicationId') from jsonb_array_elements(p_data->'rows'))<>n then raise exception 'Choose attendance for every learner in this session exactly once.'; end if;
  for item in select value from jsonb_array_elements(p_data->'rows') loop
   if not exists(select 1 from public.teaching_session_roster where session_id=sid and application_id=(item->>'applicationId')::uuid and included) or item->>'status' not in ('present','late','absent','excused') or item->>'status' is null then raise exception 'Choose a valid learner and attendance status.'; end if;
   update public.teaching_session_roster set attendance=item->>'status',recorded_by=p_actor,recorded_at=now() where session_id=sid and application_id=(item->>'applicationId')::uuid;
  end loop;
  update public.teaching_sessions set revision=revision+1 where teaching_sessions.id=sid;
 elsif p_operation='session_finish' then
  if s.id is null or (p_data->>'revision')::integer is distinct from s.revision then raise exception 'This session changed. Refresh before saving.'; end if;
  if p_data->>'status'='completed' then
   if s.status<>'scheduled' or s.ends_at>public.teaching_now() or not exists(select 1 from public.teaching_session_roster where session_id=sid and included) or exists(select 1 from public.teaching_session_roster where session_id=sid and included and attendance is null) then raise exception 'Complete an ended session after recording every learner attendance status.'; end if;
   if p_data->>'outcome' not in ('Objective covered','More practice needed','Follow-up planned') or p_data->>'outcome' is null then raise exception 'Choose a teaching outcome.'; end if;
   update public.teaching_sessions set status='completed',outcome=p_data->>'outcome',staff_note=coalesce(p_data->>'staffNote',''),revision=revision+1 where teaching_sessions.id=sid;
  elsif p_data->>'status'='cancelled' then
   if s.status<>'scheduled' or length(reason)<5 then raise exception 'Cancel a scheduled session with a reason.'; end if;
   update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where teaching_sessions.id=sid;
  else raise exception 'Choose complete or cancel.'; end if;
 elsif p_operation='material_prepare' then
  if id is null then raise exception 'A stable upload version ID is required.'; end if;
  if p_data->>'materialId' is not null then
   select * into mat from public.teaching_materials where teaching_materials.id=(p_data->>'materialId')::uuid and not archived;
   if mat.id is null then raise exception 'Material not found.'; end if;
  else
   insert into public.teaching_materials(title,grade,subject,kind) values(trim(p_data->>'title'),p_data->>'grade',p_data->>'subject',p_data->>'kind') returning * into mat;
  end if;
  insert into public.teaching_material_versions(id,material_id,version,file_name,storage_path,mime,size_bytes)
   select id,mat.id,coalesce(max(version),0)+1,p_data->>'name',mat.id||'/'||id||case p_data->>'mime' when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_data->>'mime',(p_data->>'size')::integer from public.teaching_material_versions where material_id=mat.id returning * into ver;
  result=to_jsonb(ver);
 elsif p_operation='material_resume' then
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid and finalized_at is null;
  if ver.id is null or ver.file_name is distinct from p_data->>'name' or ver.size_bytes is distinct from (p_data->>'size')::integer or ver.mime is distinct from p_data->>'mime' then raise exception 'Choose the original pending file with its recorded name, size and type.'; end if;
  result=to_jsonb(ver);
 elsif p_operation='material_finalize' then
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid;
  if ver.id is null then raise exception 'Upload not found.'; end if;
  if not exists(select 1 from storage.buckets where storage.buckets.id='teaching-materials' and not public) then raise exception 'The teaching materials bucket must be private.'; end if;
  select metadata into meta from storage.objects where bucket_id='teaching-materials' and name=ver.storage_path;
  if meta is null or coalesce(meta->>'size','')!~'^[0-9]+$' or (meta->>'size')::bigint<>ver.size_bytes or lower(split_part(coalesce(meta->>'mimetype',''),';',1))<>ver.mime then raise exception 'The uploaded file size and type could not be verified.'; end if;
  update public.teaching_material_versions set finalized_at=coalesce(finalized_at,now()) where teaching_material_versions.id=vid returning * into ver;result=to_jsonb(ver);
 elsif p_operation in ('class_material','session_material') then
  if c.id is null then raise exception 'Choose a class.'; end if;
  select * into ver from public.teaching_material_versions where teaching_material_versions.id=vid and finalized_at is not null;
  select * into mat from public.teaching_materials where teaching_materials.id=ver.material_id;
  if ver.id is null or mat.archived or mat.grade<>c.grade or mat.subject<>c.subject then raise exception 'Choose a verified material for this grade and subject.'; end if;
  if p_operation='class_material' then
   insert into public.teaching_class_materials(class_id,version_id,active) values(cid,vid,coalesce((p_data->>'active')::boolean,true)) on conflict(class_id,version_id) do update set active=excluded.active;
  else
   if s.id is null or s.status<>'scheduled' then raise exception 'Change resources only on a scheduled session.'; end if;
   if p_audience='tutor' and not exists(select 1 from public.teaching_class_materials where class_id=cid and version_id=vid and active) then raise exception 'Select a resource assigned to this class.'; end if;
   insert into public.teaching_session_materials(session_id,version_id,active) values(sid,vid,coalesce((p_data->>'active')::boolean,true)) on conflict(session_id,version_id) do update set active=excluded.active;
  end if;
 else raise exception 'Unknown teaching operation.'; end if;
 insert into public.teaching_events(actor_id,action,class_id,session_id,details) values(p_actor,p_operation,cid,sid,jsonb_build_object('requestId',rid,'reason',reason));
 insert into public.teaching_requests(id,actor_id,audience,operation,payload,result) values(rid,p_actor,p_audience,p_operation,p_data,result);
 return result;
end $$;
revoke all on function public.teaching_mutate(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.teaching_mutate(uuid,text,text,jsonb) to service_role;


create or replace function public.teaching_snapshot(p_actor uuid,p_audience text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors; ids uuid[]; sessions uuid[]; versions uuid[]; result jsonb;
begin
 perform public.teaching_access(p_actor,p_audience);
 if p_audience='tutor' then t=public.tutor_assert(p_actor); end if;
 select coalesce(array_agg(id),'{}') into ids from public.teaching_classes where p_audience='admin' or (tutor_id=t.id and not archived);
 select coalesce(array_agg(id),'{}') into sessions from (select id from public.teaching_sessions where class_id=any(ids) order by starts_at desc limit 1000)x;
 select coalesce(array_agg(distinct version_id),'{}') into versions from(
  select version_id from public.teaching_class_materials where class_id=any(ids) and active union select version_id from public.teaching_session_materials where session_id=any(sessions) and active)x;
 result=jsonb_build_object('today',(public.teaching_now() at time zone 'Africa/Johannesburg')::date,'now',public.teaching_now(),'audience',p_audience,'tutorName',t.name,
  'programmes',(select coalesce(jsonb_agg(jsonb_build_object('grade',grade,'weekdays',weekdays) order by grade),'[]') from public.tuition_programmes),
  'closures',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'reason',reason) order by day),'[]') from public.tuition_closures),
  'tutors',case when p_audience='admin' then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'enabled',enabled,'registered',user_id is not null) order by name),'[]') from public.teaching_tutors) else '[]'::jsonb end,
  'venues',case when p_audience='admin' then (select coalesce(jsonb_agg(to_jsonb(v) order by name),'[]') from public.teaching_venues v) else '[]'::jsonb end,
  'topics',(select coalesce(jsonb_agg(to_jsonb(q) order by q.grade,q.subject,q.title),'[]') from public.teaching_topics q where p_audience='admin' or exists(select 1 from public.teaching_classes c where c.id=any(ids) and c.grade=q.grade and c.subject=q.subject)),
  'learners',case when p_audience='admin' then (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.learner_name,'studentNumber',l.student_number,'grade',a.grade_level,'subjects',a.selected_subjects) order by a.learner_name),'[]') from public.applications a join public.learners l on l.application_id=a.id where a.status='active' and a.enrollment_state='active') else '[]'::jsonb end,
  'classes',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('tutorName',tt.name,'venueName',v.name,'mode',v.mode) order by c.name),'[]') from public.teaching_classes c join public.teaching_tutors tt on tt.id=c.tutor_id join public.teaching_venues v on v.id=c.venue_id where c.id=any(ids)),
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',mm.id,'class_id',mm.class_id,'application_id',mm.application_id,'joined_on',mm.joined_on,'left_on',mm.left_on,'name',a.learner_name,'studentNumber',l.student_number,'state',a.enrollment_state,'startingMark',m.current_mark,'targetMark',m.target_mark) order by a.learner_name),'[]') from public.teaching_memberships mm join public.teaching_classes c on c.id=mm.class_id join public.applications a on a.id=mm.application_id join public.learners l on l.application_id=a.id left join public.application_subjects m on m.application_id=a.id and m.subject_name=c.subject where mm.class_id=any(ids)),
  'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by starts_at desc),'[]') from public.teaching_sessions s where id=any(sessions)),
  'roster',(select coalesce(jsonb_agg(to_jsonb(r) order by learner_name),'[]') from public.teaching_session_roster r where session_id=any(sessions)),
  'materials',(select coalesce(jsonb_agg(to_jsonb(m) order by created_at desc),'[]') from public.teaching_materials m where p_audience='admin' or exists(select 1 from public.teaching_material_versions v where v.material_id=m.id and v.id=any(versions))),
  'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'material_id',v.material_id,'version',v.version,'file_name',v.file_name,'mime',v.mime,'size_bytes',v.size_bytes,'finalized_at',v.finalized_at) order by v.created_at desc),'[]') from public.teaching_material_versions v where p_audience='admin' or v.id=any(versions)),
  'classMaterials',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.teaching_class_materials m where class_id=any(ids)),
  'sessionMaterials',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.teaching_session_materials m where session_id=any(sessions)),
  'history',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'class_id',e.class_id,'session_id',e.session_id,'created_at',e.created_at,'reason',e.details->>'reason') order by e.created_at desc),'[]') from(select * from public.teaching_events where p_audience='admin' or class_id=any(ids) order by created_at desc limit 200)e),
  'limited',(select count(*)>1000 from public.teaching_sessions where class_id=any(ids)));
 return result;
end $$;
create or replace function public.teaching_file(p_actor uuid,p_audience text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v public.teaching_material_versions; t public.teaching_tutors;
begin
 perform public.teaching_access(p_actor,p_audience);
 select * into v from public.teaching_material_versions where id=p_id and finalized_at is not null;
 if v.id is null then raise exception 'Verified teaching file not found.'; end if;
 if p_audience='tutor' then
  t=public.tutor_assert(p_actor);
  if not exists(select 1 from public.teaching_class_materials cm join public.teaching_classes c on c.id=cm.class_id where cm.version_id=v.id and cm.active and c.tutor_id=t.id and not c.archived)
   and not exists(select 1 from public.teaching_session_materials sm join public.teaching_sessions s on s.id=sm.session_id join public.teaching_classes c on c.id=s.class_id where sm.version_id=v.id and sm.active and c.tutor_id=t.id and not c.archived) then raise exception 'This teaching file is not assigned to your classes.'; end if;
 end if; return to_jsonb(v);
end $$;
create or replace function public.teaching_parent_snapshot(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; result jsonb;
begin
 perform public.parent_assert(p_user);select array_agg(id) into ids from public.parent_scope(p_user) id;
 select jsonb_build_object('records',coalesce((select jsonb_agg(q order by q.starts_at desc) from(
  select rr.application_id,s.id as session_id,c.name as class_name,c.subject,s.topic_title,s.learning_goal,s.starts_at,s.ends_at,s.status,s.outcome,rr.attendance,rr.recorded_at
  from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id join public.teaching_classes c on c.id=s.class_id
  where rr.application_id=any(ids) and rr.included and s.status in ('completed','cancelled') order by s.starts_at desc limit 200)q),'[]'),
 'upcoming',coalesce((select jsonb_agg(q order by q.starts_at) from(
  select rr.application_id,c.name as class_name,c.subject,s.topic_title,s.starts_at,s.ends_at,s.mode,s.venue_name
  from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id join public.teaching_classes c on c.id=s.class_id
  where rr.application_id=any(ids) and rr.included and s.status='scheduled' and s.ends_at>=public.teaching_now() and not c.archived order by s.starts_at limit 30)q),'[]'),
 'summary',coalesce((select jsonb_agg(q) from(
  select rr.application_id,count(*)::integer as completed,
   count(*) filter(where rr.attendance in ('present','late'))::integer as attended,
   count(*) filter(where rr.attendance='absent')::integer as absent,
   count(*) filter(where rr.attendance='excused')::integer as excused,
   round(100.0*count(*) filter(where rr.attendance in ('present','late'))/nullif(count(*) filter(where rr.attendance in ('present','late','absent')),0),1) as percentage
  from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id where rr.application_id=any(ids) and rr.included and s.status='completed' group by rr.application_id)q),'[]'),
 'limited',(select count(*)>200 from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id where rr.application_id=any(ids) and rr.included and s.status in ('completed','cancelled'))) into result;
 return result;
end $$;
revoke all on function public.teaching_snapshot(uuid,text),public.teaching_file(uuid,text,uuid),public.teaching_parent_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.teaching_snapshot(uuid,text),public.teaching_file(uuid,text,uuid),public.teaching_parent_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
create or replace function public.teaching_history(p_actor uuid,p_audience text,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cid uuid; result jsonb;
begin
 select class_id into cid from public.teaching_sessions where id=p_session;
 if cid is null then raise exception 'Session not found.'; end if;
 perform public.teaching_access(p_actor,p_audience,cid);
 select coalesce(jsonb_agg(q order by q.created_at),'[]') into result from(
  select e.id,e.action,e.created_at,coalesce(t.name,'Viva administrator') as actor,e.details
  from public.teaching_events e left join public.teaching_tutors t on t.user_id=e.actor_id
  where e.session_id=p_session order by e.created_at limit 1001)q;
 if jsonb_array_length(result)>1000 then raise exception 'Contact Viva for an extended session audit export.'; end if;
 return jsonb_build_object('events',result);
end $$;
revoke all on function public.teaching_history(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.teaching_history(uuid,text,uuid) to service_role;

-- END TEACHING FOUNDATION

commit;
