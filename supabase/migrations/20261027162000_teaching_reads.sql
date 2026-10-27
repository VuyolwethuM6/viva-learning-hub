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
