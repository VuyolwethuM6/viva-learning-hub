-- M4 selection. Additive to populated M1-M3; no activation or production flag changes.
create table public.recruitment_selection_cases (
 case_id uuid primary key references public.recruitment_cases(id) on delete cascade,
 stage text not null default 'screening' check(stage in ('screening','shortlisted','not_shortlisted','information_requested','interview','evaluation','recommended','approved_for_offer','unsuccessful')),
 decision text check(decision in ('approved_for_offer','unsuccessful')), revision integer not null default 0 check(revision>=0),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.recruitment_selection_screenings (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 actor_id uuid not null references public.recruitment_staff(user_id),checks jsonb not null check(jsonb_typeof(checks)='array' and jsonb_array_length(checks) between 1 and 30),
 notes text not null check(length(notes) between 3 and 4000),created_at timestamptz not null default clock_timestamp()
);
create table public.recruitment_selection_interviews (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 round integer not null check(round between 1 and 20),type text not null check(length(type) between 2 and 100),
 starts_at timestamptz not null, ends_at timestamptz not null,location text not null check(length(location) between 3 and 1000),
 interviewer_ids uuid[] not null check(cardinality(interviewer_ids) between 1 and 10),
 status text not null default 'scheduled' check(status in ('scheduled','cancelled','completed','no_show')),
 candidate_response text check(candidate_response in ('confirmed','reschedule_requested')),
 revision integer not null default 0,created_by uuid not null references public.recruitment_staff(user_id),
 created_at timestamptz not null default clock_timestamp(),check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at and ends_at<=starts_at+interval '8 hours')
);
create index recruitment_selection_interview_schedule on public.recruitment_selection_interviews(starts_at,ends_at) where status='scheduled';
create table public.recruitment_selection_interview_history (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 interview_id uuid not null references public.recruitment_selection_interviews(id) on delete cascade,snapshot jsonb not null,
 reason text not null check(length(reason) between 3 and 4000),actor_id uuid not null,created_at timestamptz not null default clock_timestamp()
);
create table public.recruitment_selection_assessments (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 title text not null check(length(title) between 3 and 160),instructions text not null check(length(instructions) between 3 and 4000),
 due_at timestamptz not null check(isfinite(due_at)),evaluator_ids uuid[] not null check(cardinality(evaluator_ids) between 1 and 10),criteria jsonb not null check(jsonb_typeof(criteria)='array' and jsonb_array_length(criteria) between 1 and 30),
 evidence_required boolean not null,state text not null default 'scheduled' check(state in ('scheduled','completed','superseded')),
 supersedes_id uuid unique references public.recruitment_selection_assessments(id) on delete cascade,
 created_by uuid not null references public.recruitment_staff(user_id),created_at timestamptz not null default clock_timestamp()
);
create table public.recruitment_selection_assessment_results (
 id uuid primary key default gen_random_uuid(),assessment_id uuid not null references public.recruitment_selection_assessments(id) on delete cascade,
 case_id uuid not null references public.recruitment_cases(id) on delete cascade,evaluator_id uuid not null references public.recruitment_staff(user_id),
 result text not null check(result in ('completed','not_completed')),feedback text not null check(length(feedback) between 3 and 4000),evidence_ref text,
 created_at timestamptz not null default clock_timestamp(),unique(assessment_id,evaluator_id)
);
create table public.recruitment_selection_evaluations (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 interview_id uuid not null references public.recruitment_selection_interviews(id) on delete cascade,
 evaluator_id uuid not null references public.recruitment_staff(user_id),template_name text not null check(length(template_name) between 3 and 160),
 criteria jsonb not null check(jsonb_typeof(criteria)='array' and jsonb_array_length(criteria) between 1 and 30),
 total_score numeric not null check(total_score between 0 and 100),comments text not null check(length(comments) between 3 and 4000),
 replaces_id uuid unique references public.recruitment_selection_evaluations(id),correction_reason text,
 created_at timestamptz not null default clock_timestamp(),check((replaces_id is null and correction_reason is null) or length(correction_reason) between 3 and 4000)
);
create unique index recruitment_selection_initial_evaluation on public.recruitment_selection_evaluations(interview_id,evaluator_id) where replaces_id is null;
create table public.recruitment_selection_recommendations (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 outcome text not null check(outcome in ('recommended','not_recommended','further_assessment')),reason text not null check(length(reason) between 3 and 4000),
 evaluation_ids uuid[] not null,actor_id uuid not null references public.recruitment_staff(user_id),created_at timestamptz not null default clock_timestamp()
);
create table public.recruitment_selection_decisions (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 outcome text not null check(outcome in ('approved_for_offer','unsuccessful','further_assessment')),reason text not null check(length(reason) between 3 and 4000),
 recommendation_id uuid not null references public.recruitment_selection_recommendations(id) on delete cascade,
 decided_by uuid not null references public.recruitment_staff(user_id),created_at timestamptz not null default clock_timestamp()
);
create unique index recruitment_selection_final_decision on public.recruitment_selection_decisions(case_id) where outcome<>'further_assessment';
create table public.recruitment_selection_events (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 actor_id uuid not null,action text not null,request_id uuid not null,previous_stage text not null,new_stage text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index recruitment_selection_events_case on public.recruitment_selection_events(case_id,created_at desc);
create table public.recruitment_selection_requests (
 case_id uuid not null references public.recruitment_cases(id) on delete cascade,actor_id uuid not null,request_id uuid not null,
 operation text not null,payload_digest text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(case_id,actor_id,request_id),unique(actor_id,request_id)
);
create table public.recruitment_selection_confirmations (
 actor_id uuid not null references public.recruitment_staff(user_id),case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 session_hash text not null,request_id uuid not null,proof_hash text primary key,payload_digest text not null,operation text not null,expires_at timestamptz not null,
 check(proof_hash ~ '^[0-9a-f]{64}$' and session_hash ~ '^[0-9a-f]{64}$')
);
-- Case-private evidence is update-immutable, erased only by the existing controlled erasure boundary.
do $$declare n text;begin
 foreach n in array array['screenings','evaluations','recommendations','decisions','events','requests','interview_history','assessment_results'] loop
 execute format('create trigger selection_immutable before update on public.recruitment_selection_%I for each row execute function public.recruitment_immutable()',n);
 end loop;
 foreach n in array array['cases','screenings','interviews','evaluations','recommendations','decisions','events','requests','confirmations','interview_history','assessments','assessment_results'] loop
 execute format('alter table public.recruitment_selection_%I enable row level security',n);
 execute format('revoke all on public.recruitment_selection_%I from public,anon,authenticated,service_role',n);
 end loop;
end$$;

create function public.recruitment_selection_assert(p_actor uuid,p_case uuid,p_aal text,p_owner boolean default false) returns void
language plpgsql stable security definer set search_path='' as $$begin
 perform public.recruitment_assert(p_actor,p_owner);perform public.recruitment_require_assurance(p_actor,p_aal);
 if p_owner and p_aal<>'aal2' then raise exception 'mfa_required';end if;
 if not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled and selection_enabled) then raise exception 'intake_disabled';end if;
 if not public.recruitment_case_staff_allowed(p_actor,p_case,'review') or not exists(select 1 from public.recruitment_cases where id=p_case and kind='vacancy') then raise exception 'access_denied';end if;
end$$;
create function public.recruitment_selection_approved(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_selection_cases s join public.recruitment_selection_decisions d on d.case_id=s.case_id and d.outcome='approved_for_offer' join public.recruitment_cases c on c.id=s.case_id where s.case_id=p_case and s.decision='approved_for_offer' and c.state in ('submitted','under_review','recommendation_recorded') and c.retention_due_at>clock_timestamp())
$$;
create function public.recruitment_selection_prepare(p_actor uuid,p_case uuid,p_operation text,d jsonb,p_aal text,p_session text,p_proof text) returns void
language plpgsql security definer set search_path='' as $$begin
 perform public.recruitment_selection_assert(p_actor,p_case,p_aal,p_operation='decide' or (p_operation='assessment_create' and d ? 'supersedesId'));
 if p_operation not in ('screen','shortlist','interview_schedule','interview_update','evaluate','assessment_create','assessment_complete','recommend','decide') or octet_length(d::text)>65536 then raise exception 'invalid_request';end if;
 delete from public.recruitment_selection_confirmations where expires_at<clock_timestamp();
 insert into public.recruitment_selection_confirmations values(p_actor,p_case,p_session,(d->>'requestId')::uuid,p_proof,encode(sha256(convert_to(d::text,'UTF8')),'hex'),p_operation,clock_timestamp()+interval '4 minutes');
end$$;
create function public.recruitment_selection_mutate(p_actor uuid,p_case uuid,p_operation text,d jsonb,p_aal text,p_session text,p_proof text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;s public.recruitment_selection_cases;r public.recruitment_selection_requests;
 i public.recruitment_selection_interviews;e public.recruitment_selection_evaluations;rec public.recruitment_selection_recommendations;assessment_row public.recruitment_selection_assessments;
 rid uuid=(d->>'requestId')::uuid;result_id uuid;target uuid;ids uuid[];evs uuid[];t timestamptz;until_t timestamptz;item jsonb;score numeric;weights numeric;result jsonb;new_stage text;begin
 perform pg_advisory_xact_lock(hashtext(p_actor::text||rid::text));
 select * into c from public.recruitment_cases where id=p_case for update;
 perform public.recruitment_selection_assert(p_actor,p_case,p_aal,p_operation='decide' or (p_operation='assessment_create' and d ? 'supersedesId'));
 if rid is null or d->>'caseId' is distinct from p_case::text or octet_length(d::text)>65536 then raise exception 'invalid_request';end if;
 select * into r from public.recruitment_selection_requests where case_id=p_case and actor_id=p_actor and request_id=rid;
 if found then if r.operation<>p_operation or r.payload_digest<>encode(sha256(convert_to(d::text,'UTF8')),'hex') then raise exception 'request_conflict';end if;return r.result;end if;
 delete from public.recruitment_selection_confirmations where actor_id=p_actor and case_id=p_case and session_hash=p_session and proof_hash=p_proof and payload_digest=encode(sha256(convert_to(d::text,'UTF8')),'hex') and operation=p_operation and expires_at>clock_timestamp();
 if not found then raise exception 'fresh_confirmation_required';end if;
 insert into public.recruitment_selection_cases(case_id) values(p_case) on conflict do nothing;
 select * into s from public.recruitment_selection_cases where case_id=p_case for update;
 if s.revision is distinct from (d->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 if s.decision is not null then raise exception 'decision_final';end if;
 new_stage=s.stage;
 if p_operation='screen' then
  if s.stage not in ('screening','information_requested','not_shortlisted') or jsonb_typeof(d->'checks') is distinct from 'array' or jsonb_array_length(d->'checks') not between 1 and 30 or length(btrim(d->>'notes')) not between 3 and 4000 then raise exception 'invalid_transition';end if;
  for item in select value from jsonb_array_elements(d->'checks') loop
   if jsonb_typeof(item->'complete') is distinct from 'boolean' or length(item->>'key') not between 1 and 100 or length(item->>'evidence')>1000 then raise exception 'invalid_request';end if;
  end loop;
  insert into public.recruitment_selection_screenings(case_id,actor_id,checks,notes) values(p_case,p_actor,d->'checks',d->>'notes') returning id into result_id;
  new_stage='screening';
 elsif p_operation='shortlist' then
  if s.stage not in ('screening','information_requested','not_shortlisted','shortlisted') or d->>'outcome' not in ('shortlisted','not_shortlisted','information_requested','screening') or length(btrim(d->>'reason')) not between 3 and 4000 then raise exception 'invalid_transition';end if;
  if not exists(select 1 from public.recruitment_selection_screenings where case_id=p_case) then raise exception 'screening_required';end if;
  if d->>'outcome'='shortlisted' and exists(select 1 from jsonb_array_elements((select checks from public.recruitment_selection_screenings where case_id=p_case order by created_at desc limit 1)) x where not (x->>'complete')::boolean) then raise exception 'screening_incomplete';end if;
  insert into public.recruitment_selection_screenings(case_id,actor_id,checks,notes) select p_case,p_actor,checks,d->>'reason' from public.recruitment_selection_screenings where case_id=p_case order by created_at desc limit 1 returning id into result_id;
  if d->>'outcome'='information_requested' then
   if jsonb_typeof(d->'applicantMessage') is distinct from 'string' or length(btrim(d->>'applicantMessage')) not between 3 and 4000 then raise exception 'applicant_message_required';end if;
   insert into public.recruitment_case_notes(case_id,actor_id,kind,content) values(p_case,p_actor,'clarify',d->>'applicantMessage');
  end if;
  new_stage=d->>'outcome';
 elsif p_operation='interview_schedule'  then
  if s.stage not in ('shortlisted','interview','evaluation','recommended') then raise exception 'invalid_transition';end if;
  t=(d->>'startsAt')::timestamptz;until_t=t+make_interval(mins=>(d->>'durationMinutes')::integer);
  ids=array(select value::uuid from jsonb_array_elements_text(d->'interviewerIds'));
  if not isfinite(t) or t<=clock_timestamp() or (d->>'durationMinutes')::integer not between 10 and 480 or cardinality(ids) not between 1 and 10 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or length(btrim(d->>'reason')) not between 3 and 4000 then raise exception 'invalid_request';end if;
  -- Lock each interviewer in a stable order across cases; prevents races in overlap checks.
  for target in select x from unnest(ids)x order by x loop
   perform pg_advisory_xact_lock(hashtext(target::text));
   if not public.recruitment_case_staff_allowed(target,p_case,'review') then raise exception 'interviewer_not_authorized';end if;
  end loop;
  if d->>'interviewId' is not null then
   select * into i from public.recruitment_selection_interviews where id=(d->>'interviewId')::uuid and case_id=p_case for update;
   if not found or i.status<>'scheduled' then raise exception 'invalid_transition';end if;
   result_id=i.id;
  else
   if (select count(*) from public.recruitment_selection_interviews where case_id=p_case)>=100 then raise exception 'interview_limit';end if;
   result_id=gen_random_uuid();
  end if;
  if exists(select 1 from public.recruitment_selection_interviews x where x.id<>result_id and x.status='scheduled' and x.starts_at<until_t and x.ends_at>t and (x.interviewer_ids&&ids or x.case_id=p_case)) then raise exception 'interview_conflict';end if;
  insert into public.recruitment_selection_interviews(id,case_id,round,type,starts_at,ends_at,location,interviewer_ids,created_by) values(result_id,p_case,(d->>'round')::integer,d->>'type',t,until_t,d->>'location',ids,p_actor)
  on conflict(id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,interviewer_ids=excluded.interviewer_ids,round=excluded.round,type=excluded.type,candidate_response=null,revision=public.recruitment_selection_interviews.revision+1;
  insert into public.recruitment_selection_interview_history(case_id,interview_id,snapshot,reason,actor_id) select p_case,result_id,to_jsonb(x),d->>'reason',p_actor from public.recruitment_selection_interviews x where x.id=result_id;
  new_stage='interview';
 elsif p_operation='interview_update' then
  select * into i from public.recruitment_selection_interviews where id=(d->>'interviewId')::uuid and case_id=p_case for update;
  if not found or i.status<>'scheduled' or d->>'status' not in ('cancelled','completed','no_show') or length(btrim(d->>'reason')) not between 3 and 4000 then raise exception 'invalid_transition';end if;
  if (d->>'status'='completed' and i.starts_at>clock_timestamp()) or (d->>'status'='no_show' and i.ends_at>clock_timestamp()) then raise exception 'interview_not_started';end if;
  update public.recruitment_selection_interviews set status=d->>'status',revision=revision+1 where id=i.id;
  insert into public.recruitment_selection_interview_history(case_id,interview_id,snapshot,reason,actor_id) select p_case,i.id,to_jsonb(x),d->>'reason',p_actor from public.recruitment_selection_interviews x where x.id=i.id;
  result_id=i.id;new_stage=case when d->>'status'='completed' then 'evaluation' else s.stage end;
 elsif p_operation='evaluate' then
  select * into i from public.recruitment_selection_interviews where id=(d->>'interviewId')::uuid and case_id=p_case;
  if not found or i.status<>'completed' or not (p_actor=any(i.interviewer_ids)) or jsonb_typeof(d->'criteria') is distinct from 'array' or jsonb_array_length(d->'criteria') not between 1 and 30 then raise exception 'evaluation_not_authorized';end if;
  score=0;weights=0;
  for item in select value from jsonb_array_elements(d->'criteria') loop
   if (item->>'maximum')::numeric<=0 or (item->>'maximum')::numeric>100 or (item->>'weight')::numeric<=0 or (item->>'weight')::numeric>100 or (item->>'score')::numeric<0 or (item->>'score')::numeric>(item->>'maximum')::numeric or length(btrim(item->>'feedback')) not between 3 and 4000 then raise exception 'invalid_score';end if;
   score=score+(item->>'score')::numeric/(item->>'maximum')::numeric*(item->>'weight')::numeric;weights=weights+(item->>'weight')::numeric;
  end loop;
  if d->>'replacesId' is not null then
   select * into e from public.recruitment_selection_evaluations where id=(d->>'replacesId')::uuid and case_id=p_case and evaluator_id=p_actor and interview_id=i.id;
   if not found or exists(select 1 from public.recruitment_selection_evaluations where replaces_id=e.id) or length(btrim(d->>'correctionReason')) not between 3 and 4000 then raise exception 'invalid_correction';end if;
  end if;
  insert into public.recruitment_selection_evaluations(case_id,interview_id,evaluator_id,template_name,criteria,total_score,comments,replaces_id,correction_reason) values(p_case,i.id,p_actor,d->>'templateName',d->'criteria',round(score/weights*100,2),d->>'comments',(d->>'replacesId')::uuid,d->>'correctionReason') returning id into result_id;
  new_stage='evaluation';
 elsif p_operation='assessment_create' then
  if s.stage not in ('shortlisted','interview','evaluation','recommended') then raise exception 'invalid_transition';end if;
  ids=array(select value::uuid from jsonb_array_elements_text(d->'evaluatorIds'));
  if cardinality(ids) not between 1 and 10 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or (d->>'dueAt')::timestamptz<=clock_timestamp() then raise exception 'invalid_request';end if;
  for target in select x from unnest(ids)x loop if not public.recruitment_case_staff_allowed(target,p_case,'review') then raise exception 'evaluator_not_authorized';end if;end loop;
  if d ? 'supersedesId' then
   select * into assessment_row from public.recruitment_selection_assessments where id=(d->>'supersedesId')::uuid and case_id=p_case for update;
   if not found or assessment_row.state='superseded' then raise exception 'invalid_correction';end if;
   update public.recruitment_selection_assessments set state='superseded' where id=assessment_row.id;
  end if;
  insert into public.recruitment_selection_assessments(case_id,supersedes_id,title,instructions,due_at,evaluator_ids,criteria,evidence_required,created_by) values(p_case,(d->>'supersedesId')::uuid,d->>'title',d->>'instructions',(d->>'dueAt')::timestamptz,ids,d->'criteria',(d->>'evidenceRequired')::boolean,p_actor) returning id into result_id;
  new_stage='evaluation';
 elsif p_operation='assessment_complete' then
  select * into assessment_row from public.recruitment_selection_assessments where id=(d->>'assessmentId')::uuid and case_id=p_case for update;
  if not found or not (p_actor=any(assessment_row.evaluator_ids)) or assessment_row.state<>'scheduled' then raise exception 'assessment_not_authorized';end if;
  if assessment_row.evidence_required and length(btrim(coalesce(d->>'evidenceRef','')))<3 then raise exception 'assessment_evidence_required';end if;
  insert into public.recruitment_selection_assessment_results(assessment_id,case_id,evaluator_id,result,feedback,evidence_ref) values(assessment_row.id,p_case,p_actor,d->>'result',d->>'feedback',d->>'evidenceRef') returning id into result_id;
  if not exists(select 1 from unnest(assessment_row.evaluator_ids)x where not exists(select 1 from public.recruitment_selection_assessment_results b where b.assessment_id=assessment_row.id and b.evaluator_id=x and b.result='completed')) then update public.recruitment_selection_assessments set state='completed' where id=assessment_row.id;end if;
  new_stage='evaluation';
 elsif p_operation='recommend' then
  if s.stage not in ('not_shortlisted','evaluation','recommended') or d->>'outcome' not in ('recommended','not_recommended','further_assessment') then raise exception 'invalid_transition';end if;
  evs=array(select value::uuid from jsonb_array_elements_text(d->'evaluationIds'));
  if cardinality(evs)>30 or (s.stage<>'not_shortlisted' and cardinality(evs)=0) or (d->>'outcome'='recommended' and cardinality(evs)=0) then raise exception 'evaluation_required';end if;
  if exists(select 1 from unnest(evs)x where not exists(select 1 from public.recruitment_selection_evaluations a where a.id=x and a.case_id=p_case and not exists(select 1 from public.recruitment_selection_evaluations b where b.replaces_id=a.id))) then raise exception 'evaluation_changed';end if;
  insert into public.recruitment_selection_recommendations(case_id,outcome,reason,evaluation_ids,actor_id) values(p_case,d->>'outcome',d->>'reason',evs,p_actor) returning id into result_id;new_stage='recommended';
 elsif p_operation='decide' then
  select * into rec from public.recruitment_selection_recommendations where id=(d->>'recommendationId')::uuid and case_id=p_case;
  if not found or s.stage<>'recommended' or d->>'outcome' not in ('approved_for_offer','unsuccessful','further_assessment') then raise exception 'invalid_transition';end if;
  if exists(select 1 from unnest(rec.evaluation_ids)x where not exists(select 1 from public.recruitment_selection_evaluations a where a.id=x and a.case_id=p_case and not exists(select 1 from public.recruitment_selection_evaluations b where b.replaces_id=a.id))) then raise exception 'evaluation_changed';end if;
  if d->>'outcome'='approved_for_offer' and (exists(select 1 from public.recruitment_selection_assessments where case_id=p_case and state='scheduled') or rec.outcome<>'recommended' or exists(select 1 from public.recruitment_selection_interviews x where x.case_id=p_case and x.status='scheduled') or exists(select 1 from public.recruitment_selection_interviews x,unnest(x.interviewer_ids)who where x.case_id=p_case and x.status='completed' and not exists(select 1 from public.recruitment_selection_evaluations a where a.interview_id=x.id and a.evaluator_id=who))) then raise exception 'evaluation_incomplete';end if;
  insert into public.recruitment_selection_decisions(case_id,outcome,reason,recommendation_id,decided_by) values(p_case,d->>'outcome',d->>'reason',rec.id,p_actor) returning id into result_id;
  new_stage=case when d->>'outcome'='further_assessment' then 'interview' else d->>'outcome' end;
 else raise exception 'invalid_request';end if;
 update public.recruitment_selection_cases set stage=new_stage,decision=case when p_operation='decide' and d->>'outcome'<>'further_assessment' then d->>'outcome' else null end,revision=revision+1,updated_at=clock_timestamp() where case_id=p_case;
 update public.recruitment_cases set state=case when state='submitted' then 'under_review' else state end,revision=revision+1,unsuccessful_closed_at=case when new_stage='unsuccessful' then clock_timestamp() else unsuccessful_closed_at end where id=p_case;
 insert into public.recruitment_selection_events(case_id,actor_id,action,request_id,previous_stage,new_stage) values(p_case,p_actor,p_operation,rid,s.stage,new_stage);
 perform public.recruitment_case_log(p_case,'staff',p_actor,'selection_changed',rid);
 if p_operation in ('shortlist','interview_schedule','interview_update','decide') then
  insert into public.recruitment_email_outbox(case_id,template,message_key) values(p_case,'selection_status','selection:'||p_case||':'||rid) on conflict(message_key) do nothing;
 end if;
 result=jsonb_build_object('saved',true,'caseId',p_case,'revision',s.revision+1,'stage',new_stage,'resultId',result_id);
 insert into public.recruitment_selection_requests values(p_case,p_actor,rid,p_operation,encode(sha256(convert_to(d::text,'UTF8')),'hex'),result,clock_timestamp());return result;
end$$;

create function public.recruitment_selection_read(p_actor uuid,p_case uuid default null,p_aal text default 'aal1',p_search text default '',p_status text default '',p_offset integer default 0,p_vacancy uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare selection_row public.recruitment_selection_cases;begin
 perform public.recruitment_assert(p_actor);perform public.recruitment_require_assurance(p_actor,p_aal);
 if not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled and selection_enabled) then return jsonb_build_object('enabled',false,'items','[]'::jsonb);end if;
 if length(p_search)>160 or p_offset not between 0 and 100000 then raise exception 'invalid_request';end if;
 if p_case is null then
  return jsonb_build_object('enabled',true,'hasMore',(select count(*)>p_offset+30 from public.recruitment_cases c left join public.recruitment_selection_cases s on s.case_id=c.id left join public.recruitment_case_payloads p on p.id=c.current_payload_id where c.kind='vacancy' and public.recruitment_case_staff_allowed(p_actor,c.id,'read') and (p_vacancy is null or c.vacancy_id=p_vacancy) and (p_status='' or coalesce(s.stage,'screening')=p_status) and (p_search='' or concat(p.answers->'fields'->>'firstName',' ',p.answers->'fields'->>'lastName') ilike '%'||p_search||'%' or exists(select 1 from public.recruitment_case_contacts ct where ct.case_id=c.id and ct.normalized_email ilike '%'||p_search||'%'))),
   'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
    select c.id,c.reference,c.vacancy_id,c.submitted_at,coalesce(s.stage,'screening') stage,coalesce(s.revision,0) revision,
    concat(p.answers->'fields'->>'firstName',' ',p.answers->'fields'->>'lastName') name,
    not exists(select 1 from public.recruitment_case_documents d where d.case_id=c.id and d.current and d.state<>'clean') document_ready
    from public.recruitment_cases c left join public.recruitment_selection_cases s on s.case_id=c.id left join public.recruitment_case_payloads p on p.id=c.current_payload_id
    where c.kind='vacancy' and public.recruitment_case_staff_allowed(p_actor,c.id,'read') and (p_vacancy is null or c.vacancy_id=p_vacancy)
    and (p_status='' or coalesce(s.stage,'screening')=p_status) and (p_search='' or concat(p.answers->'fields'->>'firstName',' ',p.answers->'fields'->>'lastName') ilike '%'||p_search||'%' or exists(select 1 from public.recruitment_case_contacts ct where ct.case_id=c.id and ct.normalized_email ilike '%'||p_search||'%')) order by c.submitted_at desc,c.id offset p_offset limit 30)x),'[]'));
 end if;
 perform public.recruitment_selection_assert(p_actor,p_case,p_aal);
 select * into selection_row from public.recruitment_selection_cases where case_id=p_case;
 return jsonb_build_object('enabled',true,'selection',case when selection_row.case_id is null then jsonb_build_object('case_id',p_case,'stage','screening','decision',null,'revision',0) else to_jsonb(selection_row) end,
 'screening',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.recruitment_selection_screenings where case_id=p_case order by created_at desc limit 50)x),'[]'),
 'interviews',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.recruitment_selection_interviews where case_id=p_case order by starts_at desc limit 100)x),'[]'),
 'assessments',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('results',coalesce((select jsonb_agg(to_jsonb(y)) from public.recruitment_selection_assessment_results y where y.assessment_id=x.id and (y.evaluator_id=p_actor or (select role from public.recruitment_staff where user_id=p_actor) in ('owner','manager'))),'[]'::jsonb))) from (select * from public.recruitment_selection_assessments where case_id=p_case order by created_at desc limit 100)x),'[]'),
 'interviewHistory',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.recruitment_selection_interview_history where case_id=p_case order by created_at desc limit 100)x),'[]'),
 'evaluations',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.recruitment_selection_evaluations where case_id=p_case and (evaluator_id=p_actor or (select role from public.recruitment_staff where user_id=p_actor) in ('owner','manager')) order by created_at desc limit 100)x),'[]'),
 'recommendations',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.recruitment_selection_recommendations where case_id=p_case order by created_at desc limit 50)x),'[]'),
 'decisions',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.recruitment_selection_decisions where case_id=p_case order by created_at desc limit 50)x),'[]'),
 'eligibleInterviewers',coalesce((select jsonb_agg(jsonb_build_object('id',st.user_id,'email',u.email,'role',st.role)) from public.recruitment_staff st join auth.users u on u.id=st.user_id where st.enabled and public.recruitment_case_staff_allowed(st.user_id,p_case,'review')),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.recruitment_selection_events where case_id=p_case order by created_at desc limit 100)x),'[]'));
end$$;
create function public.recruitment_selection_summary(p_actor uuid,p_aal text) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 perform public.recruitment_assert(p_actor);perform public.recruitment_require_assurance(p_actor,p_aal);
 if not exists(select 1 from public.recruitment_settings where singleton and selection_enabled and case_processing_enabled) then return jsonb_build_object('enabled',false);end if;
 return jsonb_build_object('enabled',true,
 'byVacancyStatus',coalesce((select jsonb_agg(to_jsonb(x)) from (select v.status,count(*)::integer count from public.recruitment_vacancies v where public.recruitment_vacancy_visible(p_actor,v.id) group by v.status)x),'[]'),
 'byStage',coalesce((select jsonb_agg(to_jsonb(x)) from (select coalesce(s.stage,'screening') stage,count(*)::integer count from public.recruitment_cases c left join public.recruitment_selection_cases s on s.case_id=c.id where c.kind='vacancy' and public.recruitment_case_staff_allowed(p_actor,c.id,'read') group by coalesce(s.stage,'screening'))x),'[]'),
 'byVacancy',coalesce((select jsonb_agg(to_jsonb(x)) from (select c.vacancy_id "vacancyId",count(*)::integer count from public.recruitment_cases c where c.kind='vacancy' and public.recruitment_case_staff_allowed(p_actor,c.id,'read') group by c.vacancy_id limit 100)x),'[]'),
 'interviews',coalesce((select jsonb_agg(to_jsonb(x)) from (select i.status,count(*)::integer count from public.recruitment_selection_interviews i where public.recruitment_case_staff_allowed(p_actor,i.case_id,'read') group by i.status)x),'[]'),
 'processing',(select jsonb_build_object('count',count(*)::integer,'averageDays',round(avg(extract(epoch from (d.created_at-c.submitted_at))/86400)::numeric,2)) from public.recruitment_selection_decisions d join public.recruitment_cases c on c.id=d.case_id where d.outcome<>'further_assessment' and public.recruitment_case_staff_allowed(p_actor,c.id,'read')));
end$$;
create function public.recruitment_selection_recover(p_actor uuid,p_request uuid,p_aal text) returns jsonb
language plpgsql security definer set search_path='' as $$declare r public.recruitment_selection_requests;begin
 perform public.recruitment_assert(p_actor);perform public.recruitment_require_assurance(p_actor,p_aal);
 perform pg_advisory_xact_lock(hashtext(p_actor::text||p_request::text));
 select * into r from public.recruitment_selection_requests where actor_id=p_actor and request_id=p_request;
 if not found then
  if exists(select 1 from public.recruitment_selection_confirmations where actor_id=p_actor and request_id=p_request and expires_at>clock_timestamp()) then return jsonb_build_object('state','pending');end if;
  return jsonb_build_object('state','not_recorded');
 end if;
 perform public.recruitment_selection_assert(p_actor,r.case_id,p_aal);
 return jsonb_build_object('state','committed','result',r.result);
end$$;
create function public.recruitment_selection_applicant(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;begin
 c=public.recruitment_case_session(p_hash);
 if c.state not in ('submitted','under_review','recommendation_recorded') or c.retention_due_at<=clock_timestamp() or not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and kind='applicant' and revoked_at is null) then raise exception 'case_unavailable';end if;
 if not exists(select 1 from public.recruitment_settings where singleton and selection_enabled and case_processing_enabled) then return jsonb_build_object('enabled',false);end if;
 return jsonb_build_object('enabled',true,'stage',(select stage from public.recruitment_selection_cases where case_id=c.id),
 'assessments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'instructions',instructions,'dueAt',due_at,'state',state)) from (select * from public.recruitment_selection_assessments where case_id=c.id order by due_at,id limit 100) applicant_assessments),'[]'),
 'interviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'round',round,'type',type,'startsAt',starts_at,'endsAt',ends_at,'location',location,'status',status,'response',candidate_response)) from (select * from public.recruitment_selection_interviews where case_id=c.id order by starts_at desc limit 100) applicant_interviews),'[]'));
end$$;
create function public.recruitment_selection_response(p_hash text,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;r public.recruitment_selection_requests;i public.recruitment_selection_interviews;rid uuid=(d->>'requestId')::uuid;result jsonb;begin
 c=public.recruitment_case_session(p_hash);
 if not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and kind='applicant' and revoked_at is null) or c.retention_due_at<=clock_timestamp() then raise exception 'case_unavailable';end if;
 perform pg_advisory_xact_lock(hashtext(c.id::text||rid::text));
 select * into c from public.recruitment_cases where id=c.id for update;
 if not exists(select 1 from public.recruitment_settings where singleton and selection_enabled and case_processing_enabled) then raise exception 'intake_disabled';end if;
 perform public.recruitment_json_fields(d,array['requestId','interviewId','response']);
 if c.state not in ('submitted','under_review','recommendation_recorded') or rid is null or d->>'response' not in ('confirmed','reschedule_requested') then raise exception 'invalid_request';end if;
 select * into r from public.recruitment_selection_requests where case_id=c.id and actor_id=c.id and request_id=rid;
 if found then if r.payload_digest<>encode(sha256(convert_to(d::text,'UTF8')),'hex') then raise exception 'request_conflict';end if;return r.result;end if;
 select * into i from public.recruitment_selection_interviews where id=(d->>'interviewId')::uuid and case_id=c.id for update;
 if not found or i.status<>'scheduled' or i.starts_at<=clock_timestamp() then raise exception 'interview_unavailable';end if;
 update public.recruitment_selection_interviews set candidate_response=d->>'response',revision=revision+1 where id=i.id;
 result=jsonb_build_object('saved',true,'interviewId',i.id,'response',d->>'response');
 insert into public.recruitment_selection_requests values(c.id,c.id,rid,'interview_response',encode(sha256(convert_to(d::text,'UTF8')),'hex'),result,clock_timestamp());
 insert into public.recruitment_selection_events(case_id,actor_id,action,request_id,previous_stage,new_stage) values(c.id,c.id,'interview_response',rid,'interview','interview');return result;
end$$;

-- Extend only the M3 final-decision reservation, preserving the existing case guard.
do $$declare definition text;con record;begin
 for con in select conname from pg_constraint where conrelid='public.recruitment_cases'::regclass and contype='c' and pg_get_constraintdef(oid)='CHECK ((unsuccessful_closed_at IS NULL))' loop execute format('alter table public.recruitment_cases drop constraint %I',con.conname);end loop;
 select pg_get_functiondef('public.recruitment_guard_case()'::regprocedure) into definition;
 if position('if new.unsuccessful_closed_at is not null then raise exception ''final_decisions_unavailable'';end if;' in definition)=0 then raise exception 'selection_guard_dependency_changed';end if;
 definition=replace(definition,'if new.unsuccessful_closed_at is not null then raise exception ''final_decisions_unavailable'';end if;',
 'if new.unsuccessful_closed_at is not null and new.state<>''purged'' and not exists(select 1 from public.recruitment_selection_decisions where case_id=new.id and outcome=''unsuccessful'') then raise exception ''final_decision_required'';end if; if tg_op=''UPDATE'' and old.unsuccessful_closed_at is not null and new.unsuccessful_closed_at is distinct from old.unsuccessful_closed_at then raise exception ''final_decision_immutable'';end if;');
 execute definition;
end$$;
alter table public.recruitment_cases add constraint recruitment_unsuccessful_date_finite check(unsuccessful_closed_at is null or isfinite(unsuccessful_closed_at));
alter table public.recruitment_settings add column selection_enabled boolean not null default false;
-- Preserve the existing minimal case-proof horizon without placing notes/evaluations in governance journals.
do $$declare c record;begin
 select conname,pg_get_expr(conbin,conrelid) expression into c from pg_constraint where conrelid='public.recruitment_case_audit'::regclass and conname='recruitment_case_audit_action_check';
 if c.conname is null then raise exception 'selection_audit_dependency_changed';end if;
 execute format('alter table public.recruitment_case_audit drop constraint %I',c.conname);
 execute format('alter table public.recruitment_case_audit add constraint %I check ((%s) or action = %L)',c.conname,c.expression,'selection_changed');
end$$;
alter table public.recruitment_email_outbox drop constraint recruitment_email_outbox_template_check;
alter table public.recruitment_email_outbox add constraint recruitment_email_outbox_template_check check(template in ('verify','receipt','clarification','pool_renewal','staff_received','staff_assignment','selection_status'));

create function public.recruitment_selection_erasure() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.state='purged' and old.state<>'purged' then
  delete from public.recruitment_selection_confirmations where case_id=new.id;
  delete from public.recruitment_selection_requests where case_id=new.id;
  delete from public.recruitment_selection_events where case_id=new.id;
  delete from public.recruitment_selection_decisions where case_id=new.id;
  delete from public.recruitment_selection_recommendations where case_id=new.id;
  -- Self-referencing corrections must be deleted together.
  delete from public.recruitment_selection_evaluations where case_id=new.id;
  delete from public.recruitment_selection_assessment_results where case_id=new.id;
  delete from public.recruitment_selection_assessments where case_id=new.id;
  delete from public.recruitment_selection_interview_history where case_id=new.id;
  delete from public.recruitment_selection_interviews where case_id=new.id;
  delete from public.recruitment_selection_screenings where case_id=new.id;
  delete from public.recruitment_selection_cases where case_id=new.id;
 end if;return new;
end$$;
create trigger recruitment_selection_erasure before update on public.recruitment_cases for each row execute function public.recruitment_selection_erasure();

revoke all on function public.recruitment_selection_assert(uuid,uuid,text,boolean),public.recruitment_selection_approved(uuid),public.recruitment_selection_prepare(uuid,uuid,text,jsonb,text,text,text),public.recruitment_selection_mutate(uuid,uuid,text,jsonb,text,text,text),public.recruitment_selection_read(uuid,uuid,text,text,text,integer,uuid),public.recruitment_selection_summary(uuid,text),public.recruitment_selection_recover(uuid,uuid,text),public.recruitment_selection_applicant(text),public.recruitment_selection_response(text,jsonb),public.recruitment_selection_erasure() from public,anon,authenticated,service_role;
grant execute on function public.recruitment_selection_prepare(uuid,uuid,text,jsonb,text,text,text),public.recruitment_selection_mutate(uuid,uuid,text,jsonb,text,text,text),public.recruitment_selection_read(uuid,uuid,text,text,text,integer,uuid),public.recruitment_selection_summary(uuid,text),public.recruitment_selection_recover(uuid,uuid,text),public.recruitment_selection_applicant(text),public.recruitment_selection_response(text,jsonb) to service_role;
create function public.recruitment_selection_applicant_recover(p_hash text,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;r public.recruitment_selection_requests;begin
 c=public.recruitment_case_session(p_hash);
 if c.state not in ('submitted','under_review','recommendation_recorded') or c.retention_due_at<=clock_timestamp() or not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and kind='applicant' and revoked_at is null) then raise exception 'case_unavailable';end if;
 perform pg_advisory_xact_lock(hashtext(c.id::text||p_request::text));
 select * into r from public.recruitment_selection_requests where case_id=c.id and actor_id=c.id and request_id=p_request;
 if not found then return jsonb_build_object('state','not_recorded');end if;
 return jsonb_build_object('state','committed','result',r.result);
end$$;
revoke all on function public.recruitment_selection_applicant_recover(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_selection_applicant_recover(text,uuid) to service_role;
