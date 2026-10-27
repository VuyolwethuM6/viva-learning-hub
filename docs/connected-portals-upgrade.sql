-- Release 2 upgrade only. Run ALL after the first teaching setup.
begin;
do $$ begin if to_regclass('public.teaching_classes') is null then raise exception 'Apply the complete teaching-setup.sql after parent setup first.'; end if; end $$;
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

commit;
