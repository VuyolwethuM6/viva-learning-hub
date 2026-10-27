-- Complete teaching and academic release 3 upgrade. Run ALL of this file after parent setup.
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


-- Teaching release 2. Additive upgrade: existing attendance, files and finance are preserved.
create table if not exists public.teaching_slots(
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.teaching_classes(id),
 weekday smallint not null check(weekday between 1 and 7), starts_at time not null, ends_at time not null,
 active boolean not null default true, check(ends_at>starts_at), unique(class_id,weekday,starts_at,ends_at)
);
create table if not exists public.student_accounts(
 application_id uuid primary key references public.applications(id), email text not null unique,
 user_id uuid unique references auth.users(id) on delete set null, enabled boolean not null default true,
 check(email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
alter table public.teaching_sessions add column if not exists series_id uuid;
alter table public.teaching_materials add column if not exists owner_class_id uuid references public.teaching_classes(id);
alter table public.teaching_class_materials add column if not exists learner_visible boolean not null default false;
alter table public.teaching_session_materials add column if not exists learner_visible boolean not null default false;
-- Backfill only on first upgrade; subsequent runs must not restore retired slots.
do $$ begin
 if not exists(select 1 from public.teaching_slots) then
  insert into public.teaching_slots(class_id,weekday,starts_at,ends_at)
   select c.id,d,c.starts_at,c.ends_at from public.teaching_classes c cross join lateral unnest(c.weekdays) d on conflict do nothing;
 end if;
end $$;
create or replace function public.teaching_seed_slots() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.teaching_slots(class_id,weekday,starts_at,ends_at) select new.id,d,new.starts_at,new.ends_at from unnest(new.weekdays) d;
 return new;
end $$;
drop trigger if exists teaching_seed on public.teaching_classes;
create trigger teaching_seed after insert on public.teaching_classes for each row execute function public.teaching_seed_slots();
do $$ declare n text; begin foreach n in array array['teaching_slots','student_accounts'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant all on public.%I to service_role',n);
 execute format('drop trigger if exists teaching_track on public.%I',n);
 execute format('create trigger teaching_track after insert or update or delete on public.%I for each row execute function public.teaching_track_change()',n);
end loop; end $$;
create or replace function public.teaching_slot_issue(p_class uuid,p_day date,p_start time,p_end time,p_exclude uuid default null) returns text
language plpgsql stable security definer set search_path='' as $$
declare c public.teaching_classes; v public.teaching_venues; d integer=extract(isodow from p_day);
begin
 select * into c from public.teaching_classes where id=p_class;
 select * into v from public.teaching_venues where id=c.venue_id and active;
 if c.id is null or c.archived or v.id is null or not exists(select 1 from public.teaching_tutors where id=c.tutor_id and enabled) then return 'Class, tutor or room is unavailable'; end if;
 if p_day is null or extract(year from p_day)<>c.season or extract(month from p_day) not between 2 and 11 or not(d=any(c.weekdays)) then return 'Outside the teaching season or class days'; end if;
 if exists(select 1 from public.tuition_closures where day=p_day) then return 'Configured closure'; end if;
 if p_start is null or p_end is null or p_end<=p_start then return 'Choose a valid time slot'; end if;
 if c.grade='Matric Rewrite' then
  if p_start<time '09:00' or p_end>time '12:00' or (d in (1,3) and c.subject not in ('Mathematics','Mathematical Literacy')) or (d in (2,4) and c.subject not in ('Physical Sciences','Life Sciences')) then return 'Outside this subject programme'; end if;
 elsif d<=5 and (p_start<time '16:00' or p_end>time '19:00') then return 'Afternoon programme runs 16:00–19:00';
 elsif d=7 and (c.grade<>'Grade 12' or v.mode<>'Online') then return 'Sunday is Grade 12 online feedback'; end if;
 if exists(select 1 from public.teaching_sessions x where x.id is distinct from p_exclude and x.status<>'cancelled' and
 (x.tutor_id=c.tutor_id or x.class_id=c.id or (x.mode=v.mode and x.venue_detail=v.detail and (v.mode='Online' or x.venue_name=v.name)))
 and x.starts_at<((p_day+p_end) at time zone 'Africa/Johannesburg') and x.ends_at>((p_day+p_start) at time zone 'Africa/Johannesburg')) then return 'Time overlaps a class, tutor or room session'; end if;
 if exists(select 1 from public.teaching_memberships mm join public.applications a on a.id=mm.application_id
 join public.teaching_session_roster rr on rr.application_id=mm.application_id and rr.included
 join public.teaching_sessions s on s.id=rr.session_id and s.status<>'cancelled' and s.id is distinct from p_exclude
 where mm.class_id=c.id and mm.joined_on<=p_day and (mm.left_on is null or mm.left_on>p_day) and a.status='active' and a.enrollment_state='active'
 and s.starts_at<((p_day+p_end) at time zone 'Africa/Johannesburg') and s.ends_at>((p_day+p_start) at time zone 'Africa/Johannesburg')) then return 'A learner has an overlapping session'; end if;
 return null;
end $$;
create or replace function public.teaching_schedule(p_actor uuid,p_audience text,p_class uuid,p_day date,p_slot uuid default null,p_until date default null,p_exclude uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare slots jsonb; dates jsonb='[]'; sl public.teaching_slots; dt date=p_day; issue text; n integer=0;
begin
 perform public.teaching_access(p_actor,p_audience,p_class);
 if p_exclude is not null and not exists(select 1 from public.teaching_sessions where id=p_exclude and class_id=p_class and status='scheduled' and starts_at>public.teaching_now()) then raise exception 'Only future scheduled sessions can be rescheduled.'; end if;
 if p_day is null or (p_until is not null and (p_until<p_day or p_until>p_day+77)) then raise exception 'Choose a date range of at most twelve weekly sessions.'; end if;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('issue',public.teaching_slot_issue(p_class,p_day,s.starts_at,s.ends_at,p_exclude)) order by s.starts_at),'[]') into slots from public.teaching_slots s where s.class_id=p_class and s.active and s.weekday=extract(isodow from p_day);
 if p_slot is not null then
  select * into sl from public.teaching_slots where id=p_slot and class_id=p_class and active and weekday=extract(isodow from p_day);
  if sl.id is null then raise exception 'Choose a saved time slot for this day.'; end if;
  while dt<=coalesce(p_until,p_day) loop
   issue=public.teaching_slot_issue(p_class,dt,sl.starts_at,sl.ends_at,p_exclude);
   dates=dates||jsonb_build_array(jsonb_build_object('day',dt,'startTime',sl.starts_at,'endTime',sl.ends_at,'issue',issue)); dt=dt+7;n=n+1;
  end loop;
 end if;
 return jsonb_build_object('slots',slots,'dates',dates);
end $$;

create or replace function public.teaching_slot_issue_excluding(p_class uuid,p_day date,p_start time,p_end time,p_excludes uuid[]) returns text
language plpgsql stable security definer set search_path='' as $$
declare c public.teaching_classes; v public.teaching_venues; d integer=extract(isodow from p_day);
begin
 select * into c from public.teaching_classes where id=p_class;
 select * into v from public.teaching_venues where id=c.venue_id and active;
 if c.id is null or c.archived or v.id is null or not exists(select 1 from public.teaching_tutors where id=c.tutor_id and enabled) then return 'Class, tutor or room is unavailable'; end if;
 if p_day is null or extract(year from p_day)<>c.season or extract(month from p_day) not between 2 and 11 or not(d=any(c.weekdays)) then return 'Outside the teaching season or class days'; end if;
 if exists(select 1 from public.tuition_closures where day=p_day) then return 'Configured closure'; end if;
 if p_start is null or p_end is null or p_end<=p_start then return 'Choose a valid time slot'; end if;
 if c.grade='Matric Rewrite' then
  if p_start<time '09:00' or p_end>time '12:00' or (d in (1,3) and c.subject not in ('Mathematics','Mathematical Literacy')) or (d in (2,4) and c.subject not in ('Physical Sciences','Life Sciences')) then return 'Outside this subject programme'; end if;
 elsif d<=5 and (p_start<time '16:00' or p_end>time '19:00') then return 'Afternoon programme runs 16:00–19:00';
 elsif d=7 and (c.grade<>'Grade 12' or v.mode<>'Online') then return 'Sunday is Grade 12 online feedback'; end if;
 if exists(select 1 from public.teaching_sessions x where x.id<>all(coalesce(p_excludes,'{}'::uuid[])) and x.status<>'cancelled' and
 (x.tutor_id=c.tutor_id or x.class_id=c.id or (x.mode=v.mode and x.venue_detail=v.detail and (v.mode='Online' or x.venue_name=v.name)))
 and x.starts_at<((p_day+p_end) at time zone 'Africa/Johannesburg') and x.ends_at>((p_day+p_start) at time zone 'Africa/Johannesburg')) then return 'Time overlaps a class, tutor or room session'; end if;
 if exists(select 1 from public.teaching_memberships mm join public.applications a on a.id=mm.application_id
 join public.teaching_session_roster rr on rr.application_id=mm.application_id and rr.included
 join public.teaching_sessions s on s.id=rr.session_id and s.status<>'cancelled' and s.id<>all(coalesce(p_excludes,'{}'::uuid[]))
 where mm.class_id=c.id and mm.joined_on<=p_day and (mm.left_on is null or mm.left_on>p_day) and a.status='active' and a.enrollment_state='active'
 and s.starts_at<((p_day+p_end) at time zone 'Africa/Johannesburg') and s.ends_at>((p_day+p_start) at time zone 'Africa/Johannesburg')) then return 'A learner has an overlapping session'; end if;
 return null;
end $$;
create or replace function public.teaching_series_preview(p_actor uuid,p_audience text,p_session uuid,p_day date,p_slot uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.teaching_sessions; target public.teaching_sessions; sl public.teaching_slots; ids uuid[]; dt date; slots jsonb; dates jsonb='[]'; issue text;
begin
 select * into s from public.teaching_sessions where id=p_session and status='scheduled' and starts_at>public.teaching_now();
 if s.id is null or p_day is null then raise exception 'Choose a future scheduled session and replacement date.'; end if;
 perform public.teaching_access(p_actor,p_audience,s.class_id);
 select array_agg(id) into ids from public.teaching_sessions where class_id=s.class_id and status='scheduled' and starts_at>=s.starts_at and (id=s.id or (s.series_id is not null and series_id=s.series_id));
 if cardinality(ids)>12 then raise exception 'Review at most twelve future sessions at a time.'; end if;
 select coalesce(jsonb_agg(to_jsonb(ts)||jsonb_build_object('issue',public.teaching_slot_issue_excluding(s.class_id,p_day,ts.starts_at,ts.ends_at,ids)) order by ts.starts_at),'[]') into slots from public.teaching_slots ts where class_id=s.class_id and active and weekday=extract(isodow from p_day);
 if p_slot is not null then
  select * into sl from public.teaching_slots where id=p_slot and class_id=s.class_id and active and weekday=extract(isodow from p_day);
  if sl.id is null then raise exception 'Choose a saved time slot for this day.'; end if;
  for target in select * from public.teaching_sessions where id=any(ids) order by starts_at loop
   dt=p_day+((target.starts_at at time zone 'Africa/Johannesburg')::date-(s.starts_at at time zone 'Africa/Johannesburg')::date);
   issue=public.teaching_slot_issue_excluding(s.class_id,dt,sl.starts_at,sl.ends_at,ids);
   if (dt+sl.starts_at) at time zone 'Africa/Johannesburg'<=public.teaching_now() then issue='Replacement sessions must be in the future'; end if;
   dates=dates||jsonb_build_array(jsonb_build_object('oldId',target.id,'day',dt,'startTime',sl.starts_at,'endTime',sl.ends_at,'issue',issue));
  end loop;
 end if;
 return jsonb_build_object('slots',slots,'dates',dates);
end $$;
create or replace function public.teaching_mutate(p_actor uuid,p_audience text,p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare req public.teaching_requests; rid uuid=(p_data->>'requestId')::uuid; cid uuid=(p_data->>'classId')::uuid;
 sid uuid=(p_data->>'sessionId')::uuid; id uuid=(p_data->>'id')::uuid; vid uuid=(p_data->>'versionId')::uuid;
 c public.teaching_classes; s public.teaching_sessions; t public.teaching_tutors; topic public.teaching_topics; venue public.teaching_venues;
 mat public.teaching_materials; ver public.teaching_material_versions; a public.applications; e public.teaching_session_roster;
 result jsonb='{}'; schedule jsonb; occurrence jsonb; slot public.teaching_slots; first_sid uuid; day date; start_t time; end_t time; ds smallint[]; item jsonb; n integer; meta jsonb; reason text=trim(coalesce(p_data->>'reason',''));
begin
 if rid is null then raise exception 'A stable request ID is required.'; end if;
 perform public.teaching_access(p_actor,p_audience,cid);
 perform 1 from public.teaching_settings where singleton for update;
 select * into req from public.teaching_requests where teaching_requests.id=rid;
 if req.id is not null then
  if req.actor_id<>p_actor or req.audience<>p_audience or req.operation<>p_operation or req.payload<>p_data then raise exception 'This request ID was already used for another operation.'; end if; return req.result;
 end if;
 perform set_config('viva.teaching_actor',p_actor::text,true);
 if p_operation not in ('attendance','session_finish','session_material','session_create','topic_create','material_prepare','material_resume','material_finalize','class_material','material_release','session_reschedule') and p_audience<>'admin' then raise exception 'Only administrators can change teaching setup.'; end if;
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
 if p_audience='tutor' and p_operation in ('topic_create','material_prepare','material_resume','material_finalize','class_material','material_release','session_create','session_reschedule') then
  if c.id is null then raise exception 'Only administrators can change setup without an assigned class.'; end if;
  if p_operation='topic_create' and (p_data->>'grade' is distinct from c.grade or p_data->>'subject' is distinct from c.subject) then raise exception 'Choose this class grade and subject.'; end if;
  if p_operation in ('material_resume','material_finalize','material_release','class_material') and not exists(
   select 1 from public.teaching_material_versions mv join public.teaching_materials m on m.id=mv.material_id where mv.id=vid and (m.owner_class_id=c.id or exists(select 1 from public.teaching_class_materials cm where cm.class_id=c.id and cm.version_id=vid and cm.active))) then raise exception 'This material is not owned by or assigned to this class.'; end if;
  if p_operation in ('material_resume','material_finalize') and not exists(select 1 from public.teaching_material_versions mv join public.teaching_materials m on m.id=mv.material_id where mv.id=vid and m.owner_class_id=c.id) then raise exception 'Only the owning class can finish an upload.'; end if;
 end if;
 if p_operation='student_access' then
  perform public.admin_assert(p_actor);
  select * into a from public.applications where applications.id=(p_data->>'applicationId')::uuid;
  if a.id is null or a.status<>'active' or a.enrollment_state<>'active' or length(reason)<5 then raise exception 'Choose an active learner and confirm the access review.'; end if;
  if coalesce((p_data->>'enabled')::boolean,true) then
   if lower(trim(a.learner_email))=lower(trim(a.guardian_email)) then raise exception 'Use parent-assisted learning when the learner shares the guardian email.'; end if;
   insert into public.student_accounts(application_id,email) values(a.id,lower(trim(a.learner_email)))
   on conflict(application_id) do update set email=excluded.email,user_id=case when student_accounts.email=excluded.email then student_accounts.user_id else null end,enabled=true;
  else update public.student_accounts set enabled=false where application_id=a.id; end if;
  result=jsonb_build_object('applicationId',a.id);
 elsif p_operation='slot_save' then
  perform public.admin_assert(p_actor);
  if c.id is null or length(reason)<5 then raise exception 'Choose a class and timetable change reason.'; end if;
  if id is not null then update public.teaching_slots set active=false where teaching_slots.id=id and class_id=c.id;
   if not found then raise exception 'Time slot not found.'; end if;
  else
   if not((p_data->>'weekday')::smallint=any(c.weekdays)) then raise exception 'Choose a class teaching day.'; end if;
   start_t=(p_data->>'startTime')::time;end_t=(p_data->>'endTime')::time;
   if start_t is null or end_t is null or end_t<=start_t then raise exception 'Choose a valid slot.'; end if;
   if c.grade='Matric Rewrite' and (start_t<time '09:00' or end_t>time '12:00') or c.grade<>'Matric Rewrite' and (p_data->>'weekday')::integer<=5 and (start_t<time '16:00' or end_t>time '19:00') then raise exception 'Choose times within the enrollment programme.'; end if;
   if exists(select 1 from public.teaching_slots ts where ts.class_id=c.id and ts.weekday=(p_data->>'weekday')::integer and ts.active and ts.starts_at<end_t and ts.ends_at>start_t) then raise exception 'This slot overlaps an existing timetable slot. Retire the old slot first.'; end if;
   insert into public.teaching_slots(class_id,weekday,starts_at,ends_at) values(c.id,(p_data->>'weekday')::smallint,start_t,end_t) on conflict(class_id,weekday,starts_at,ends_at) do update set active=true;
  end if;
  -- Slot edits never rewrite sessions already on the calendar.
 elsif p_operation='material_release' then
  if c.id is null then raise exception 'Choose a class.'; end if;
  if sid is null then update public.teaching_class_materials set learner_visible=(p_data->>'visible')::boolean where class_id=c.id and version_id=vid and active;
  else update public.teaching_session_materials set learner_visible=(p_data->>'visible')::boolean where session_id=sid and version_id=vid and active; end if;
  if not found then raise exception 'Attach the verified resource before releasing it.'; end if;
 elsif p_operation='session_reschedule' then
  if s.id is null or s.status<>'scheduled' or s.starts_at<=public.teaching_now() or (p_data->>'revision')::integer is distinct from s.revision or length(reason)<5 then raise exception 'Choose a future unchanged session and a reason.'; end if;
  if p_data->>'scope'='series' then
   schedule=public.teaching_series_preview(p_actor,p_audience,s.id,(p_data->>'day')::date,(p_data->>'slotId')::uuid);
   if jsonb_array_length(schedule->'dates')=0 or exists(select 1 from jsonb_array_elements(schedule->'dates') d where d->>'issue' is not null) then raise exception 'One or more replacement dates are unavailable. Review every date.'; end if;
   update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where teaching_sessions.id in(select (d->>'oldId')::uuid from jsonb_array_elements(schedule->'dates') d);
   result='[]';
   for occurrence in select value from jsonb_array_elements(schedule->'dates') loop
    select * into s from public.teaching_sessions where teaching_sessions.id=(occurrence->>'oldId')::uuid;
    meta=public.teaching_mutate(p_actor,p_audience,'session_create',jsonb_build_object('requestId',gen_random_uuid(),'classId',c.id,'topicId',s.topic_id,'day',occurrence->>'day','slotId',p_data->>'slotId'));
    update public.teaching_sessions set series_id=rid where teaching_sessions.id=(meta->>'sessionId')::uuid;
    result=result||jsonb_build_array(meta||jsonb_build_object('replaces',s.id));
   end loop;
   result=jsonb_build_object('sessions',result);
  else
  schedule=public.teaching_schedule(p_actor,p_audience,c.id,(p_data->>'day')::date,(p_data->>'slotId')::uuid,null,s.id);
  occurrence=schedule->'dates'->0;
  if occurrence is null or occurrence->>'issue' is not null or ((occurrence->>'day')::date+(occurrence->>'startTime')::time) at time zone 'Africa/Johannesburg'<=public.teaching_now() then raise exception 'The replacement time is unavailable: %',occurrence->>'issue'; end if;
  update public.teaching_sessions set status='cancelled',cancel_reason=reason,revision=revision+1 where teaching_sessions.id=s.id;
  result=public.teaching_mutate(p_actor,p_audience,'session_create',jsonb_build_object('requestId',gen_random_uuid(),'classId',c.id,'topicId',s.topic_id,'day',p_data->>'day','slotId',p_data->>'slotId'));
  result=result||jsonb_build_object('replaces',s.id);
  end if;
 elsif p_operation='tutor_save' then
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
  day=(p_data->>'day')::date;
  if c.id is null then raise exception 'Choose a class.'; end if;
  if p_data->>'slotId' is not null then select * into slot from public.teaching_slots where teaching_slots.id=(p_data->>'slotId')::uuid and class_id=c.id and active;
  else select * into slot from public.teaching_slots where class_id=c.id and active and weekday=extract(isodow from day)
   and (p_data->>'startTime' is null or starts_at=(p_data->>'startTime')::time) and (p_data->>'endTime' is null or ends_at=(p_data->>'endTime')::time) order by starts_at limit 1; end if;
  if slot.id is null then raise exception 'Choose a saved time slot for this day in the teaching season.'; end if;
  schedule=public.teaching_schedule(p_actor,p_audience,c.id,day,slot.id,nullif(p_data->>'until','')::date);
  if exists(select 1 from jsonb_array_elements(schedule->'dates') x where x->>'issue' is not null) then
   select x->>'issue' into reason from jsonb_array_elements(schedule->'dates') x where x->>'issue' is not null limit 1;
   raise exception 'Cannot schedule: %',reason;
  end if;
  select * into topic from public.teaching_topics where teaching_topics.id=(p_data->>'topicId')::uuid and active;
  select * into venue from public.teaching_venues where teaching_venues.id=c.venue_id and active;
  if topic.id is null or topic.grade<>c.grade or topic.subject<>c.subject then raise exception 'Choose a matching learning topic.'; end if;
  result='[]';
  for occurrence in select value from jsonb_array_elements(schedule->'dates') loop
   day=(occurrence->>'day')::date;start_t=slot.starts_at;end_t=slot.ends_at;
  insert into public.teaching_sessions(class_id,topic_id,topic_title,learning_goal,tutor_id,venue_name,venue_detail,mode,starts_at,ends_at,series_id)
   values(cid,topic.id,topic.title,topic.goal,c.tutor_id,venue.name,venue.detail,venue.mode,(day+start_t) at time zone 'Africa/Johannesburg',(day+end_t) at time zone 'Africa/Johannesburg',rid) returning teaching_sessions.id into sid;
  insert into public.teaching_session_roster(session_id,application_id,learner_name,student_number,starting_mark,target_mark)
   select sid,a0.id,a0.learner_name,l.student_number,m.current_mark,m.target_mark from public.teaching_memberships mm join public.applications a0 on a0.id=mm.application_id join public.learners l on l.application_id=a0.id left join public.application_subjects m on m.application_id=a0.id and m.subject_name=c.subject
   where mm.class_id=cid and mm.joined_on<=day and (mm.left_on is null or mm.left_on>day) and a0.status='active' and a0.enrollment_state='active';
  insert into public.teaching_session_materials(session_id,version_id,learner_visible) select sid,version_id,learner_visible from public.teaching_class_materials where class_id=cid and active;
  first_sid=coalesce(first_sid,sid); result=result||jsonb_build_array(jsonb_build_object('sessionId',sid,'day',day));

  end loop;
  result=jsonb_build_object('sessionId',first_sid,'sessions',result);
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
   if p_audience='tutor' and mat.owner_class_id is distinct from c.id then raise exception 'Only the owning class can upload a new version.'; end if;
  else
   insert into public.teaching_materials(title,grade,subject,kind,owner_class_id) values(trim(p_data->>'title'),case when p_audience='tutor' then c.grade else p_data->>'grade' end,case when p_audience='tutor' then c.subject else p_data->>'subject' end,p_data->>'kind',case when p_audience='tutor' then c.id else null end) returning * into mat;
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
   if p_audience='tutor' and mat.owner_class_id is distinct from c.id and not exists(select 1 from public.teaching_class_materials where class_id=cid and version_id=vid and active) then raise exception 'Select a resource assigned to this class.'; end if;
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
  select v.id as version_id from public.teaching_material_versions v join public.teaching_materials m on m.id=v.material_id where m.owner_class_id=any(ids) union select version_id from public.teaching_class_materials where class_id=any(ids) and active union select version_id from public.teaching_session_materials where session_id=any(sessions) and active)x;
 result=jsonb_build_object('today',(public.teaching_now() at time zone 'Africa/Johannesburg')::date,'now',public.teaching_now(),'audience',p_audience,'tutorName',t.name,
  'programmes',(select coalesce(jsonb_agg(jsonb_build_object('grade',grade,'weekdays',weekdays) order by grade),'[]') from public.tuition_programmes),
  'closures',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'reason',reason) order by day),'[]') from public.tuition_closures),
  'tutors',case when p_audience='admin' then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'enabled',enabled,'registered',user_id is not null) order by name),'[]') from public.teaching_tutors) else '[]'::jsonb end,
  'venues',case when p_audience='admin' then (select coalesce(jsonb_agg(to_jsonb(v) order by name),'[]') from public.teaching_venues v) else '[]'::jsonb end,
  'topics',(select coalesce(jsonb_agg(to_jsonb(q) order by q.grade,q.subject,q.title),'[]') from public.teaching_topics q where p_audience='admin' or exists(select 1 from public.teaching_classes c where c.id=any(ids) and c.grade=q.grade and c.subject=q.subject)),
  'learners',case when p_audience='admin' then (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.learner_name,'studentNumber',l.student_number,'grade',a.grade_level,'subjects',a.selected_subjects,'learnerEmail',a.learner_email,'studentAccess',coalesce((select enabled from public.student_accounts sa where sa.application_id=a.id),false)) order by a.learner_name),'[]') from public.applications a join public.learners l on l.application_id=a.id where a.status='active' and a.enrollment_state='active') else '[]'::jsonb end,
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
 return result||jsonb_build_object('slots',(select coalesce(jsonb_agg(to_jsonb(sl) order by weekday,starts_at),'[]') from public.teaching_slots sl where sl.class_id=any(ids)));
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
  if not exists(select 1 from public.teaching_materials m join public.teaching_classes c on c.id=m.owner_class_id where m.id=v.material_id and c.tutor_id=t.id and not c.archived) and not exists(select 1 from public.teaching_class_materials cm join public.teaching_classes c on c.id=cm.class_id where cm.version_id=v.id and cm.active and c.tutor_id=t.id and not c.archived)
   and not exists(select 1 from public.teaching_session_materials sm join public.teaching_sessions s on s.id=sm.session_id join public.teaching_classes c on c.id=s.class_id where sm.version_id=v.id and sm.active and c.tutor_id=t.id and not c.archived) then raise exception 'This teaching file is not assigned to your classes.'; end if;
 end if; return to_jsonb(v);
end $$;

create or replace function public.student_signin_allowed(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_accounts sa join public.applications a on a.id=sa.application_id where sa.email=lower(trim(p_email)) and sa.enabled and a.status='active' and a.enrollment_state='active');
$$;
create or replace function public.student_assert(p_user uuid) returns public.student_accounts language plpgsql stable security definer set search_path='' as $$
declare r public.student_accounts;
begin
 select sa.* into r from public.student_accounts sa join auth.users u on u.id=sa.user_id join public.applications a on a.id=sa.application_id
 where sa.user_id=p_user and sa.email=lower(trim(u.email)) and u.email_confirmed_at is not null and sa.enabled and a.status='active' and a.enrollment_state='active';
 if r.application_id is null then raise exception 'Student access is unavailable. Contact Viva Tutorials.'; end if;return r;
end $$;
create or replace function public.student_bind(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.student_accounts; em text; confirmed timestamptz;
begin
 select lower(trim(email)),email_confirmed_at into em,confirmed from auth.users where id=p_user;
 if confirmed is null then raise exception 'Verify your student email before signing in.'; end if;
 select * into r from public.student_accounts where email=em and enabled for update;
 if r.application_id is null or (r.user_id is not null and r.user_id<>p_user) or not exists(select 1 from public.applications where id=r.application_id and status='active' and enrollment_state='active') then raise exception 'Student access is unavailable.'; end if;
 perform set_config('viva.teaching_actor',p_user::text,true);
 update public.student_accounts set user_id=p_user where application_id=r.application_id;
 return jsonb_build_object('id',p_user,'email',em);
end $$;
create or replace function public.student_scope(p_user uuid,p_audience text,p_application uuid default null) returns uuid language plpgsql stable security definer set search_path='' as $$
declare r public.student_accounts; aid uuid;
begin
 if p_audience='student' then r=public.student_assert(p_user);aid=r.application_id;
  if p_application is not null and p_application<>aid then raise exception 'This learner is not available to your account.'; end if;
 elsif p_audience='parent' then
  perform public.parent_assert(p_user);
  if p_application is null or not exists(select 1 from public.parent_scope(p_user) x where x=p_application) then raise exception 'This learner is not available to your family.'; end if;aid=p_application;
 else raise exception 'Invalid learning access.'; end if;
 if not exists(select 1 from public.applications where id=aid and status='active' and enrollment_state='active') then raise exception 'Learning access is available for active learners. Contact Viva.'; end if;
 return aid;
end $$;
create or replace function public.student_snapshot(p_user uuid,p_audience text,p_application uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare aid uuid; ids uuid[]; ss uuid[]; vv uuid[]; result jsonb;
begin
 aid=public.student_scope(p_user,p_audience,p_application);
 select coalesce(array_agg(distinct class_id),'{}') into ids from public.teaching_memberships where application_id=aid;
 select coalesce(array_agg(id),'{}') into ss from(select s.id from public.teaching_sessions s join public.teaching_session_roster rr on rr.session_id=s.id where rr.application_id=aid and rr.included order by s.starts_at desc limit 1000) q;
 select coalesce(array_agg(distinct version_id),'{}') into vv from(
  select cm.version_id from public.teaching_class_materials cm join public.teaching_classes c on c.id=cm.class_id where cm.active and cm.learner_visible and not c.archived and exists(select 1 from public.teaching_memberships mm where mm.class_id=c.id and mm.application_id=aid and mm.joined_on<=(public.teaching_now() at time zone 'Africa/Johannesburg')::date and (mm.left_on is null or mm.left_on>(public.teaching_now() at time zone 'Africa/Johannesburg')::date))
  union select sm.version_id from public.teaching_session_materials sm join public.teaching_sessions s on s.id=sm.session_id where sm.active and sm.learner_visible and sm.session_id=any(ss) and s.status<>'cancelled') q;
 select jsonb_build_object('today',(public.teaching_now() at time zone 'Africa/Johannesburg')::date,'now',public.teaching_now(),'assisted',p_audience='parent',
 'learner',(select jsonb_build_object('id',a.id,'name',a.learner_name,'grade',a.grade_level,'studentNumber',l.student_number) from public.applications a join public.learners l on l.application_id=a.id where a.id=aid),
 'subjects',(select coalesce(jsonb_agg(jsonb_build_object('name',subject_name,'startingMark',current_mark,'targetMark',target_mark) order by subject_name),'[]') from public.application_subjects where application_id=aid),
 'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'subject',c.subject,'tutorName',t.name,'archived',c.archived,'mode',v.mode) order by c.name),'[]') from public.teaching_classes c join public.teaching_tutors t on t.id=c.tutor_id join public.teaching_venues v on v.id=c.venue_id where c.id=any(ids)),
 'slots',(select coalesce(jsonb_agg(to_jsonb(sl) order by weekday,starts_at),'[]') from public.teaching_slots sl where sl.active and sl.class_id=any(ids) and exists(select 1 from public.teaching_memberships m where m.class_id=sl.class_id and m.application_id=aid and m.joined_on<=(public.teaching_now() at time zone 'Africa/Johannesburg')::date and (m.left_on is null or m.left_on>(public.teaching_now() at time zone 'Africa/Johannesburg')::date))),
 'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'class_id',s.class_id,'topic_title',s.topic_title,'learning_goal',s.learning_goal,'starts_at',s.starts_at,'ends_at',s.ends_at,'mode',s.mode,'venue_name',s.venue_name,'room',case when s.status='scheduled' and s.ends_at>=public.teaching_now() and not c.archived then s.venue_detail else null end,'status',s.status,'attendance',case when s.status='completed' then rr.attendance else null end,'outcome',case when s.status='completed' then s.outcome else null end) order by s.starts_at desc),'[]') from public.teaching_sessions s join public.teaching_classes c on c.id=s.class_id join public.teaching_session_roster rr on rr.session_id=s.id and rr.application_id=aid where s.id=any(ss)),
 'materials',(select coalesce(jsonb_agg(jsonb_build_object('id',mv.id,'title',m.title,'subject',m.subject,'kind',m.kind,'version',mv.version,'file_name',mv.file_name,'mime',mv.mime,'size_bytes',mv.size_bytes) order by m.title),'[]') from public.teaching_material_versions mv join public.teaching_materials m on m.id=mv.material_id where mv.id=any(vv) and mv.finalized_at is not null and not m.archived),
 'attendance',(select jsonb_build_object('completed',count(*),'attended',count(*) filter(where rr.attendance in ('present','late')),'absent',count(*) filter(where rr.attendance='absent'),'excused',count(*) filter(where rr.attendance='excused'),'percentage',round(100.0*count(*) filter(where rr.attendance in ('present','late'))/nullif(count(*) filter(where rr.attendance in ('present','late','absent')),0),1)) from public.teaching_session_roster rr join public.teaching_sessions s on s.id=rr.session_id where rr.application_id=aid and rr.included and s.status='completed'),
 'limited',(select count(*)>1000 from public.teaching_sessions s join public.teaching_session_roster rr on rr.session_id=s.id where rr.application_id=aid and rr.included)) into result;
 return result;
end $$;
create or replace function public.student_file(p_user uuid,p_audience text,p_id uuid,p_application uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snap jsonb; result jsonb;
begin
 snap=public.student_snapshot(p_user,p_audience,p_application);
 if not exists(select 1 from jsonb_array_elements(snap->'materials') m where m->>'id'=p_id::text) then raise exception 'This resource is not released to your learner account.'; end if;
 select to_jsonb(v) into result from public.teaching_material_versions v where id=p_id and finalized_at is not null;
 return result;
end $$;
revoke all on function public.teaching_seed_slots(),public.teaching_slot_issue(uuid,date,time,time,uuid),public.teaching_schedule(uuid,text,uuid,date,uuid,date,uuid),public.student_signin_allowed(text),public.student_assert(uuid),public.student_bind(uuid),public.student_scope(uuid,text,uuid),public.student_snapshot(uuid,text,uuid),public.student_file(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.teaching_schedule(uuid,text,uuid,date,uuid,date,uuid),public.student_signin_allowed(text),public.student_assert(uuid),public.student_bind(uuid),public.student_snapshot(uuid,text,uuid),public.student_file(uuid,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';

revoke all on function public.teaching_slot_issue_excluding(uuid,date,time,time,uuid[]),public.teaching_series_preview(uuid,text,uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.teaching_series_preview(uuid,text,uuid,date,uuid) to service_role;

create or replace function public.teaching_track_change() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; c uuid; s uuid;
begin
 if tg_op='DELETE' then raise exception 'Teaching history cannot be deleted. Archive or correct the record.'; end if;
 actor=nullif(current_setting('viva.teaching_actor',true),'')::uuid;
 if actor is null then raise exception 'Use an authorized teaching operation so its history is recorded.'; end if;
 if tg_table_name='teaching_classes' then c=new.id;
 elsif tg_table_name='teaching_sessions' then c=new.class_id; s=new.id;
 elsif tg_table_name in ('teaching_memberships','teaching_class_materials','teaching_slots') then c=new.class_id;
 elsif tg_table_name in ('teaching_session_roster','teaching_session_materials') then s=new.session_id;select class_id into c from public.teaching_sessions where id=s;
 end if;
 insert into public.teaching_events(actor_id,action,class_id,session_id,details) values(actor,tg_table_name||':'||lower(tg_op),c,s,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;


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

-- END TEACHING FOUNDATION

commit;
