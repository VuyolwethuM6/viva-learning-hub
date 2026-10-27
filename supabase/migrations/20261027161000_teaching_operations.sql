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
