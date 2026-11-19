-- INCREMENTAL M4/M5 EXECUTION-REVIEW PACKAGE. DO NOT EXECUTE WITHOUT EXACT-SCRIPT APPROVAL.
-- Existing populated M1–M3 ONLY. Never rerun the fresh installer or platform schema.
-- Replace the three non-secret references after reviewing the exact target and backups.
begin;
set local lock_timeout='5s';
set local statement_timeout='180s';
set local viva_m45.operator='__REQUIRED_OPERATOR_REFERENCE__';
set local viva_m45.approval='__REQUIRED_M45_APPROVAL_REFERENCE__';
set local viva_m45.project='__REQUIRED_PROJECT_REFERENCE__';
lock table public.recruitment_settings in share row exclusive mode;
do $m45_preflight$
declare n text;begin
 if current_setting('viva_m45.operator') like '%__REQUIRED_%' or current_setting('viva_m45.approval') like '%__REQUIRED_%' or current_setting('viva_m45.project') like '%__REQUIRED_%'
 then raise exception 'Explicit target, operator and exact-script approval references are required';end if;
 if not exists(select 1 from public.recruitment_operational_events where action='installation_m1_m3' and details->>'sourceSetSha256'='6262989e8a7ce90ce6431e15b0c9f2923dbde84be48079dfc05b50517f6553e3')
 then raise exception 'Unsupported baseline: verified M1–M3 installation evidence required';end if;
 if exists(select 1 from public.recruitment_operational_events where action='installation_m4_m5')
 then raise exception 'M4/M5 already installed; use reviewed forward recovery';end if;
 for n in select name from(values ('recruitment_access_approvals'),
('recruitment_applicant_sessions'),
('recruitment_auth_limits'),
('recruitment_case_assignments'),
('recruitment_case_audit'),
('recruitment_case_challenges'),
('recruitment_case_conflicts'),
('recruitment_case_contacts'),
('recruitment_case_documents'),
('recruitment_case_notes'),
('recruitment_case_payloads'),
('recruitment_case_requests'),
('recruitment_cases'),
('recruitment_consent_events'),
('recruitment_deletion_jobs'),
('recruitment_document_scans'),
('recruitment_email_challenges'),
('recruitment_email_outbox'),
('recruitment_erasure_evidence'),
('recruitment_events'),
('recruitment_intake_form_bindings'),
('recruitment_intake_forms'),
('recruitment_intake_limits'),
('recruitment_operational_events'),
('recruitment_privacy_holds'),
('recruitment_privacy_notices'),
('recruitment_reauth_challenges'),
('recruitment_requests'),
('recruitment_retention_runs'),
('recruitment_scopes'),
('recruitment_settings'),
('recruitment_staff'),
('recruitment_staff_change_buffers'),
('recruitment_staff_scopes'),
('recruitment_submissions'),
('recruitment_tutor_bindings'),
('recruitment_tutor_rebind_authorizations'),
('recruitment_vacancies'),
('recruitment_vacancy_approvals'),
('recruitment_vacancy_assignments'),
('recruitment_vacancy_publications'),
('recruitment_vacancy_versions')) expected(name) loop
  if not exists(select 1 from pg_class where oid=to_regclass('public.'||n) and relkind='r' and relrowsecurity) then raise exception 'Unsupported baseline table/RLS: %',n;end if;
 end loop;
 for n in select name from(values ('recruitment_agreement_acceptances'),
('recruitment_agreement_templates'),
('recruitment_engagement_cases'),
('recruitment_engagement_events'),
('recruitment_engagement_requests'),
('recruitment_lifecycle_cancellations'),
('recruitment_lifecycle_notifications'),
('recruitment_offer_versions'),
('recruitment_offers'),
('recruitment_onboarding_document_links'),
('recruitment_onboarding_tasks'),
('recruitment_selection_assessment_results'),
('recruitment_selection_assessments'),
('recruitment_selection_cases'),
('recruitment_selection_confirmations'),
('recruitment_selection_decisions'),
('recruitment_selection_evaluations'),
('recruitment_selection_events'),
('recruitment_selection_interview_history'),
('recruitment_selection_interviews'),
('recruitment_selection_recommendations'),
('recruitment_selection_requests'),
('recruitment_selection_screenings'),
('recruitment_staff_engagements'),
('recruitment_tutor_session_payments')) expected(name) loop
  if to_regclass('public.'||n) is not null then raise exception 'M4/M5 object already exists: %; do not partially reinstall',n;end if;
 end loop;
 if (select count(*) from public.recruitment_settings)<>1 then raise exception 'Unsupported recruitment settings cardinality';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='accounting_document_data')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='accounting_document_data' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='ec5ea4629543c57aa8dd51e9d9c763619a6dea83bb4cf7b69071ea96cd066acc')
 then raise exception 'Unsupported baseline function: accounting_document_data; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='accounting_export_rows')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='accounting_export_rows' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='beba3b95f78c9f565ea1ca2b54e6c4c534ab51a4b2d75211bd492410d0caf86a')
 then raise exception 'Unsupported baseline function: accounting_export_rows; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='accounting_snapshot')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='accounting_snapshot' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='13b1a8b66fc0d73368203979f91890914a00da048bba8ddb755926b753d073d9')
 then raise exception 'Unsupported baseline function: accounting_snapshot; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_discard_complete')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_discard_complete' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='f78063ceb2a1d5e25eca62f1513d50d6939fd995598254afeeacfa63df1cc3e0')
 then raise exception 'Unsupported baseline function: recruitment_discard_complete; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_discarded_documents')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_discarded_documents' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='892a2dfb855bfe1ed6786fb03739acaa0e93418afb18f01c83327ebbac1b2fb2')
 then raise exception 'Unsupported baseline function: recruitment_discarded_documents; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_document_mutate')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_document_mutate' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='25247b0540ca769603c36cc758d53d27ed9b9b8c5bdaefeb652a79cd03ddbcd8')
 then raise exception 'Unsupported baseline function: recruitment_document_mutate; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_guard_access')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_guard_access' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='697303667e37399c321126f5688b54304089d5c81ef33908f5a553674bfa1699')
 then raise exception 'Unsupported baseline function: recruitment_guard_access; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_guard_case')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_guard_case' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='3f436ad599c8ebf6ac08df6f2dbfb35577aa957fe715040ecfae78b1a82acfe0')
 then raise exception 'Unsupported baseline function: recruitment_guard_case; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_mail_authorize')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_mail_authorize' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='be1bd94d2991023e7ad1e9438d6df84dbe626c0b383d7354ac4c228288f86b00')
 then raise exception 'Unsupported baseline function: recruitment_mail_authorize; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_scan_claim')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_scan_claim' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='282c558d2622af1f239cf3a4c49eb9eaab92f8b15617aac6028fa73a27362c7d')
 then raise exception 'Unsupported baseline function: recruitment_scan_claim; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_scan_complete')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_scan_complete' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='fb66d9f081cdf3efdc1898d95f7c902361618878787ffba07ee332c0163907ec')
 then raise exception 'Unsupported baseline function: recruitment_scan_complete; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_scan_promote')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_scan_promote' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='ca97dd3daf62f741679455fc53eb872256cfa9133da910b688cc2343a6c4f06c')
 then raise exception 'Unsupported baseline function: recruitment_scan_promote; review target drift before installation';end if;

 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_snapshot')<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recruitment_snapshot' and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='44b079966837469a8cc602d53ba66ae8c3051cd7ce488afb2f7de140cc42333c')
 then raise exception 'Unsupported baseline function: recruitment_snapshot; review target drift before installation';end if;
end $m45_preflight$;
create temporary table viva_m45_settings_before on commit drop as select to_jsonb(s) value from public.recruitment_settings s;
create temporary table viva_m45_buckets_before on commit drop as select id,to_jsonb(b) value from storage.buckets b;

-- BEGIN EXACT SOURCE: supabase/migrations/20261115010000_recruitment_selection.sql
-- SHA256 e50393e253cd245b9ee736ad3f8aad1da306370754f0de43d78c903a5c156e68
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

-- END EXACT SOURCE: supabase/migrations/20261115010000_recruitment_selection.sql

-- BEGIN EXACT SOURCE: supabase/migrations/20261115020000_recruitment_engagement.sql
-- SHA256 6cfa200dad4fcdf84c9dbcea0fb3b9dc8c83bc6b94c3979c3d19e3c0a2f0beb6
-- M5 additive engagement workflow. No feature flag or production activation.
-- Prerequisite M4 selection, existing M1-M3 schema. Rehearse on disposable PostgreSQL.
alter table public.recruitment_settings add column if not exists onboarding_enabled boolean not null default false,add column if not exists activation_enabled boolean not null default false;
alter table public.recruitment_email_outbox drop constraint if exists recruitment_email_outbox_template_check;
alter table public.recruitment_email_outbox add constraint recruitment_email_outbox_template_check check(template in ('verify','receipt','clarification','pool_renewal','staff_received','staff_assignment','selection_status','engagement_status'));
create table public.recruitment_engagement_cases (
 case_id uuid primary key references public.recruitment_cases(id) on delete cascade, revision integer not null default 0 check(revision>=0),
 category text not null check(category in ('tutor','administrator','support_staff')), onboarding_started_at timestamptz
);
create table public.recruitment_agreement_templates (
 id uuid primary key default gen_random_uuid(), agreement_type text not null check(agreement_type in ('employment','independent_contractor','volunteer','confidentiality','code_of_conduct','role_policy')),
 engagement_type text not null check(engagement_type in ('employee','independent_contractor','volunteer')),
 title text not null check(length(btrim(title)) between 2 and 180), body text not null check(length(btrim(body)) between 20 and 24000),
 legal_approval_reference text not null check(legal_approval_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$'),
 approved_by uuid not null references public.recruitment_staff(user_id), approved_at timestamptz not null default clock_timestamp()
);
create table public.recruitment_offer_versions (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_engagement_cases(case_id),
 version integer not null check(version>0), terms jsonb not null check(jsonb_typeof(terms)='object' and octet_length(terms::text)<20000),
 agreement_template_id uuid not null references public.recruitment_agreement_templates(id),
 engagement_change_approval_reference text, created_by uuid not null references public.recruitment_staff(user_id),created_at timestamptz not null default clock_timestamp(),
 unique(case_id,version),unique(case_id,id)
);
create table public.recruitment_offers (
 id uuid primary key,case_id uuid not null, status text not null default 'draft' check(status in ('draft','approved','issued','accepted','declined','withdrawn','expired')),
 approved_by uuid references public.recruitment_staff(user_id),approved_at timestamptz,issued_at timestamptz,accepted_at timestamptz,responded_at timestamptz,
 foreign key(case_id,id) references public.recruitment_offer_versions(case_id,id),
 check((approved_by is null)=(approved_at is null)),check(status not in ('approved','issued','accepted','declined') or approved_by is not null),
 check(status not in ('issued','accepted','declined') or issued_at is not null),check((status='accepted')=(accepted_at is not null))
);
create unique index recruitment_offer_live_case on public.recruitment_offers(case_id) where status in ('draft','approved','issued','accepted');
create table public.recruitment_agreement_acceptances (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_engagement_cases(case_id),
 template_id uuid not null references public.recruitment_agreement_templates(id),offer_id uuid not null references public.recruitment_offers(id),
 accepted_at timestamptz not null default clock_timestamp(),method text not null default 'verified_email_case_session' check(method='verified_email_case_session'),
 request_id uuid not null,terms_digest text not null check(terms_digest ~ '^[0-9a-f]{64}$'),unique(case_id,template_id)
);
create table public.recruitment_onboarding_tasks (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.recruitment_engagement_cases(case_id),
 key text not null,label text not null, kind text not null check(kind in ('document','agreement','declaration','required_check')),
 required boolean not null default true,status text not null default 'pending' check(status in ('pending','submitted','verified')),
 document_id uuid,template_id uuid references public.recruitment_agreement_templates(id),evidence_reference text,completed_at timestamptz,assigned_to uuid references public.recruitment_staff(user_id),due_at timestamptz,
 verified_by uuid references public.recruitment_staff(user_id),verified_at timestamptz,
 foreign key(case_id,document_id) references public.recruitment_case_documents(case_id,id) on delete set null (document_id),
 unique(case_id,key),check((verified_by is null)=(verified_at is null)),check(status<>'verified' or verified_by is not null)
);
create table public.recruitment_staff_engagements (
 case_id uuid primary key references public.recruitment_engagement_cases(case_id),user_id uuid not null references auth.users(id),
 tutor_id uuid references public.teaching_tutors(id),status text not null check(status in ('active','suspended','ended')),
 subjects text[] not null default '{}',grades text[] not null default '{}',permissions text[] not null default '{}',
 approved_by uuid not null references public.recruitment_staff(user_id),activated_at timestamptz not null default clock_timestamp(),ended_at timestamptz,
 activation_txid bigint not null,offboarding_reference text,ended_effective_on date,check((status='ended')=(ended_at is not null)),
 check(permissions <@ array['administration']::text[])
);
create table public.recruitment_tutor_session_payments (
 session_id uuid primary key references public.teaching_sessions(id),case_id uuid not null, -- Opaque provenance only; financial evidence survives applicant header erasure.
 bill_id uuid not null references public.accounting_bills(id),rate_cents integer not null check(rate_cents>0),approved_by uuid not null references public.recruitment_staff(user_id),approved_at timestamptz not null default clock_timestamp()
);
create trigger recruitment_tutor_payment_immutable before update or delete on public.recruitment_tutor_session_payments for each row execute function public.recruitment_immutable();
create unique index recruitment_engagement_active_user on public.recruitment_staff_engagements(user_id) where status<>'ended';
create unique index recruitment_engagement_active_tutor on public.recruitment_staff_engagements(tutor_id) where status<>'ended';
create table public.recruitment_engagement_requests (
 case_id uuid not null references public.recruitment_engagement_cases(case_id),actor_kind text not null check(actor_kind in ('staff','applicant')),
 actor_id uuid not null,request_id uuid not null,operation text not null,payload_digest text not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(case_id,actor_kind,actor_id,request_id)
);
create unique index recruitment_engagement_request_actor on public.recruitment_engagement_requests(actor_kind,actor_id,request_id);
-- PII-free journal. Case-scoped details remain private and subject to erasure.
create table public.recruitment_engagement_events (
 id uuid primary key default gen_random_uuid(),case_id uuid not null,actor_kind text not null check(actor_kind in ('staff','applicant','worker')),
 actor_id uuid,action text not null,request_id uuid,revision integer not null,payload_digest text,
 created_at timestamptz not null default clock_timestamp()
);
create index recruitment_engagement_event_case on public.recruitment_engagement_events(case_id,created_at,id);
create index recruitment_onboarding_pending on public.recruitment_onboarding_tasks(case_id,status);
create trigger recruitment_agreement_template_immutable before update or delete on public.recruitment_agreement_templates for each row execute function public.recruitment_immutable();
create trigger recruitment_offer_version_immutable before update on public.recruitment_offer_versions for each row execute function public.recruitment_immutable();
create trigger recruitment_agreement_acceptance_immutable before update on public.recruitment_agreement_acceptances for each row execute function public.recruitment_immutable();
create trigger recruitment_engagement_event_immutable before update or delete on public.recruitment_engagement_events for each row execute function public.recruitment_immutable();
do $$declare t text;begin
 foreach t in array array['recruitment_engagement_cases','recruitment_agreement_templates','recruitment_offer_versions','recruitment_offers','recruitment_agreement_acceptances','recruitment_onboarding_tasks','recruitment_staff_engagements','recruitment_engagement_requests','recruitment_engagement_events','recruitment_tutor_session_payments'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;

create or replace function public.recruitment_engagement_init(p_case uuid) returns public.recruitment_engagement_cases
language plpgsql security definer set search_path='' as $$declare e public.recruitment_engagement_cases;category text;begin
 select v.content->>'category' into category from public.recruitment_cases c join public.recruitment_vacancy_versions v on v.id=c.version_id where c.id=p_case and c.kind='vacancy' and c.state in ('submitted','under_review','recommendation_recorded') and c.retention_due_at>clock_timestamp();
 if category is null then raise exception 'case_unavailable';end if;
 insert into public.recruitment_engagement_cases(case_id,category) values(p_case,category) on conflict do nothing;
 select * into e from public.recruitment_engagement_cases where case_id=p_case for update;return e;
end$$;
create or replace function public.recruitment_engagement_projection(p_case uuid,p_staff boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('caseId',e.case_id,'revision',e.revision,'category',e.category,
 'caseReference',(select reference from public.recruitment_cases where id=p_case),
 'vacancyReference',(select v.reference from public.recruitment_cases c join public.recruitment_vacancies v on v.id=c.vacancy_id where c.id=p_case),
 'candidateName',(select concat(p.answers->'fields'->>'firstName',' ',p.answers->'fields'->>'lastName') from public.recruitment_submissions sub join public.recruitment_case_payloads p on p.id=sub.payload_id and p.case_id=sub.case_id where sub.case_id=p_case),
 'offers',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'terms',v.terms,'status',o.status,'approved_by',case when p_staff then o.approved_by else null end,'issued_at',o.issued_at,'accepted_at',o.accepted_at) order by v.version desc) from public.recruitment_offer_versions v join public.recruitment_offers o on o.id=v.id where v.case_id=p_case and (p_staff or o.issued_at is not null)),'[]'),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'agreement_type',t.agreement_type,'engagement_type',t.engagement_type,'title',t.title,'body',t.body,'legal_approval_reference',case when p_staff then t.legal_approval_reference else null end)) from public.recruitment_agreement_templates t where p_staff or exists(select 1 from public.recruitment_offer_versions v join public.recruitment_offers o on o.id=v.id where v.case_id=p_case and o.issued_at is not null and v.agreement_template_id=t.id) or exists(select 1 from public.recruitment_onboarding_tasks ot where ot.case_id=p_case and ot.template_id=t.id)),'[]'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'key',t.key,'label',t.label,'kind',t.kind,'required',t.required,'status',t.status,'document_id',t.document_id,'template_id',t.template_id,'evidence_reference',case when p_staff then t.evidence_reference else null end,'assigned_to',case when p_staff then t.assigned_to else null end,'due_at',t.due_at) order by t.key) from public.recruitment_onboarding_tasks t where t.case_id=p_case),'[]'),
 'acceptedTemplateIds',coalesce((select jsonb_agg(a.template_id) from public.recruitment_agreement_acceptances a where a.case_id=p_case),'[]'),
 'activation',case when p_staff then (select to_jsonb(a)-'activation_txid' from public.recruitment_staff_engagements a where a.case_id=p_case) else (select jsonb_build_object('status',a.status,'activated_at',a.activated_at,'ended_at',a.ended_at) from public.recruitment_staff_engagements a where a.case_id=p_case) end,
 'events',case when p_staff then coalesce((select jsonb_agg(to_jsonb(x)) from (select action,created_at,actor_id from public.recruitment_engagement_events where case_id=p_case order by created_at desc limit 100) x),'[]') else '[]'::jsonb end)
 from public.recruitment_engagement_cases e where e.case_id=p_case
$$;
create or replace function public.recruitment_engagement_read(p_actor uuid,p_case uuid,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$declare e public.recruitment_engagement_cases;begin
 perform public.recruitment_selection_assert(p_actor,p_case,p_aal,false);
 e=public.recruitment_engagement_init(p_case);return public.recruitment_engagement_projection(p_case,true);
end$$;
create or replace function public.recruitment_engagement_notice(p_case uuid,p_key text) returns void
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.recruitment_settings where singleton and applicant_email_enabled) then
 insert into public.recruitment_email_outbox(case_id,template,message_key) values(p_case,'engagement_status','engagement:'||p_key) on conflict(message_key) do nothing;
 end if;
end$$;
create function public.recruitment_offer_terms_valid(t jsonb) returns boolean
language plpgsql immutable set search_path='' as $$declare k text;begin
 if jsonb_typeof(t) is distinct from 'object' or not(t ?& array['positionTitle','engagementType','startDate','workArrangement','reportingArrangements','compensationTerms','sessionRateCents','expiresAt','conditions','agreementTemplateId']) then return false;end if;
 for k in select jsonb_object_keys(t) loop
  if k='sessionRateCents' then
   if jsonb_typeof(t->k) is distinct from 'number' or t->>k !~ '^[0-9]{1,9}$' or (t->>k)::bigint>100000000 then return false;end if;
  elsif jsonb_typeof(t->k) is distinct from 'string' then return false;end if;
 end loop;
 return t->>'engagementType' in ('employee','independent_contractor','volunteer') and t->>'agreementTemplateId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and t->>'startDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and length(t->>'conditions')<=4000;
end$$;
revoke all on function public.recruitment_offer_terms_valid(jsonb) from public,anon,authenticated,service_role;

create or replace function public.recruitment_engagement_mutate(p_actor uuid,p_operation text,d jsonb,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;e public.recruitment_engagement_cases;v public.recruitment_offer_versions;o public.recruitment_offers;
 t public.recruitment_agreement_templates;task public.recruitment_onboarding_tasks;a public.recruitment_staff_engagements;r public.recruitment_engagement_requests;
 rid uuid;payload_digest text;result jsonb;new_id uuid;own boolean;terms jsonb;contact text;uid uuid;tid uuid;category text;doc record;grade_value text;subject_value text;session_ids uuid[];rate integer;bill jsonb;
begin
 if p_operation is null or p_operation not in ('template_approve','offer_create','offer_approve','offer_issue','offer_withdraw','onboarding_start','task_verify','activation_approve','access_suspend','access_resume','offboard','task_require','task_assign','session_payment_prepare','policy_require') or jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>40000 then raise exception 'invalid_request';end if;
 own=p_operation in ('template_approve','offer_approve','offer_issue','offer_withdraw','activation_approve','access_suspend','access_resume','offboard','task_require','session_payment_prepare','policy_require') or (p_operation='offer_create' and d ? 'engagementChangeApprovalReference');
 if p_operation in ('access_suspend','offboard','session_payment_prepare') then
  perform public.recruitment_assert(p_actor,true);perform public.recruitment_require_assurance(p_actor,p_aal);
  if p_aal<>'aal2' or public.recruitment_case_conflicted(p_actor,(d->>'caseId')::uuid) then raise exception 'access_denied';end if;
 else
  perform public.recruitment_selection_assert(p_actor,(d->>'caseId')::uuid,p_aal,own);
  if not exists(select 1 from public.recruitment_settings where singleton and onboarding_enabled) then raise exception 'onboarding_disabled';end if;
 end if;
 select * into c from public.recruitment_cases where id=(d->>'caseId')::uuid for update;
 if p_operation in ('access_suspend','offboard','session_payment_prepare') then
  select * into e from public.recruitment_engagement_cases where case_id=c.id for update;
  if e.case_id is null then raise exception 'case_unavailable';end if;
 else e=public.recruitment_engagement_init(c.id);end if;
 rid=(d->>'requestId')::uuid;
 if rid is null or d->>'expectedRevision' is null then raise exception 'invalid_request';end if;
 payload_digest=encode(sha256(convert_to(jsonb_build_object('operation',p_operation,'data',d)::text,'UTF8')),'hex');
 select * into r from public.recruitment_engagement_requests where case_id=c.id and actor_kind='staff' and actor_id=p_actor and request_id=rid;
 if r.request_id is not null then if r.operation<>p_operation or r.payload_digest<>payload_digest then raise exception 'request_conflict';end if;return r.result||'{"replayed":true}'::jsonb;end if;
 if e.revision<>(d->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 if p_operation not in ('access_suspend','offboard','session_payment_prepare') and not public.recruitment_selection_approved(c.id) then raise exception 'hiring_approval_required';end if;
 if p_operation in ('onboarding_start','policy_require','task_require','task_assign','task_verify') and exists(select 1 from public.recruitment_staff_engagements where case_id=c.id) then raise exception 'onboarding_locked_after_activation';end if;
 if p_operation='task_assign' and exists(select 1 from public.recruitment_staff where user_id=p_actor and role='officer') then raise exception 'access_denied';end if;
 perform set_config('viva.teaching_actor',p_actor::text,true);
 if p_operation='template_approve' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','agreementType','engagementType','title','body','legalApprovalReference']);
  insert into public.recruitment_agreement_templates(agreement_type,engagement_type,title,body,legal_approval_reference,approved_by) values(d->>'agreementType',d->>'engagementType',d->>'title',d->>'body',d->>'legalApprovalReference',p_actor) returning id into new_id;
 elsif p_operation='offer_create' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','terms']||case when d ? 'engagementChangeApprovalReference' then array['engagementChangeApprovalReference'] else '{}'::text[] end);terms=d->'terms';
  if not public.recruitment_offer_terms_valid(terms) then raise exception 'invalid_offer';end if;
  perform public.recruitment_json_fields(terms,array['positionTitle','engagementType','startDate','workArrangement','reportingArrangements','compensationTerms','sessionRateCents','expiresAt','conditions','agreementTemplateId']);
  select * into t from public.recruitment_agreement_templates where id=(terms->>'agreementTemplateId')::uuid;
  if t.id is null or t.engagement_type is distinct from terms->>'engagementType' or t.agreement_type is distinct from (case terms->>'engagementType' when 'employee' then 'employment' else terms->>'engagementType' end)
  or length(btrim(terms->>'positionTitle')) not between 2 and 180 or length(btrim(terms->>'workArrangement')) not between 1 and 4000 or length(btrim(terms->>'reportingArrangements')) not between 1 and 4000 or length(btrim(terms->>'compensationTerms')) not between 1 and 4000
  or (terms->>'sessionRateCents')::bigint not between 0 and 100000000 or not isfinite((terms->>'expiresAt')::timestamptz) or (terms->>'expiresAt')::timestamptz<=clock_timestamp() or (terms->>'startDate')::date<current_date then raise exception 'invalid_offer';end if;
  if terms->>'engagementType' is distinct from (select content->>'engagementType' from public.recruitment_vacancy_versions where id=c.version_id) and coalesce(d->>'engagementChangeApprovalReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' then raise exception 'engagement_change_approval_required';end if;
  if exists(select 1 from public.recruitment_offers where case_id=c.id and status in ('draft','approved','issued','accepted')) then raise exception 'offer_exists';end if;
  insert into public.recruitment_offer_versions(case_id,version,terms,agreement_template_id,engagement_change_approval_reference,created_by) values(c.id,(select coalesce(max(version),0)+1 from public.recruitment_offer_versions where case_id=c.id),terms,t.id,d->>'engagementChangeApprovalReference',p_actor) returning id into new_id;
  insert into public.recruitment_offers(id,case_id) values(new_id,c.id);
 elsif p_operation in ('offer_approve','offer_issue','offer_withdraw','onboarding_start') then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','offerId']||case when p_operation='offer_withdraw' then array['reason'] else '{}'::text[] end);
  select * into o from public.recruitment_offers where id=(d->>'offerId')::uuid and case_id=c.id for update;
  select * into v from public.recruitment_offer_versions where id=o.id;new_id=o.id;
  if o.id is null then raise exception 'offer_unavailable';end if;
  if p_operation='offer_approve' then
   if o.status<>'draft' or (v.terms->>'expiresAt')::timestamptz<=clock_timestamp() then raise exception 'invalid_transition';end if;
   update public.recruitment_offers set status='approved',approved_by=p_actor,approved_at=clock_timestamp() where id=o.id;
  elsif p_operation='offer_issue' then
   if o.status<>'approved' or (v.terms->>'expiresAt')::timestamptz<=clock_timestamp() then raise exception 'invalid_transition';end if;
   update public.recruitment_offers set status='issued',issued_at=clock_timestamp() where id=o.id;perform public.recruitment_engagement_notice(c.id,o.id||':issued');
  elsif p_operation='offer_withdraw' then
   if o.status not in ('draft','approved','issued') or length(btrim(d->>'reason')) not between 1 and 4000 then raise exception 'invalid_transition';end if;
   update public.recruitment_offers set status='withdrawn' where id=o.id;perform public.recruitment_engagement_notice(c.id,o.id||':withdrawn');
  else
   if o.status<>'accepted' or e.onboarding_started_at is not null then raise exception 'invalid_transition';end if;
   update public.recruitment_engagement_cases set onboarding_started_at=clock_timestamp() where case_id=c.id;
   insert into public.recruitment_onboarding_tasks(case_id,key,label,kind) values(c.id,'agreement','Accept the approved engagement agreement','agreement'),(c.id,'identity','Verify identity against approved evidence','required_check'),(c.id,'conduct','Accept the approved code of conduct','agreement'),(c.id,'role_checks','Complete required role and engagement checks','required_check');
   if e.category='tutor' then insert into public.recruitment_onboarding_tasks(case_id,key,label,kind) values(c.id,'qualifications','Verify tutor qualifications and approved subjects/grades','required_check');end if;
   for doc in select value from jsonb_array_elements((select definition->'requiredDocuments' from public.recruitment_intake_forms where id=c.form_id)) where (value->>'required')::boolean loop
    insert into public.recruitment_onboarding_tasks(case_id,key,label,kind) values(c.id,'document:'||(doc.value->>'key'),doc.value->>'label','document');
   end loop;
   perform public.recruitment_engagement_notice(c.id,o.id||':onboarding');
  end if;
 elsif p_operation='policy_require' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','templateId']);
  select * into t from public.recruitment_agreement_templates where id=(d->>'templateId')::uuid;
  if e.onboarding_started_at is null or t.id is null or t.agreement_type not in ('code_of_conduct','confidentiality','role_policy') or not exists(select 1 from public.recruitment_offers o1 join public.recruitment_offer_versions v1 on v1.id=o1.id where o1.case_id=c.id and o1.status='accepted' and v1.terms->>'engagementType'=t.engagement_type) then raise exception 'agreement_unavailable';end if;
  if t.agreement_type='code_of_conduct' then
   update public.recruitment_onboarding_tasks set template_id=t.id,label=t.title where case_id=c.id and key='conduct' and status='pending' and template_id is null returning id into new_id;
   if new_id is null then raise exception 'policy_already_assigned';end if;
  else
   insert into public.recruitment_onboarding_tasks(case_id,key,label,kind,template_id) values(c.id,'policy:'||t.id,t.title,'agreement',t.id) returning id into new_id;
  end if;
 elsif p_operation='task_require' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','key','label','kind','required','dueAt']);
  if e.onboarding_started_at is null or d->>'key' !~ '^[a-z][a-z0-9_-]{0,59}$' or length(btrim(d->>'label')) not between 2 and 180 or d->>'kind' not in ('document','declaration','required_check') or jsonb_typeof(d->'required') is distinct from 'boolean' or (d->>'dueAt')::timestamptz<=clock_timestamp() then raise exception 'invalid_request';end if;
  insert into public.recruitment_onboarding_tasks(case_id,key,label,kind,required,due_at) values(c.id,case when d->>'kind'='document' then 'document:' else '' end||(d->>'key'),d->>'label',d->>'kind',(d->>'required')::boolean,(d->>'dueAt')::timestamptz) returning id into new_id;
 elsif p_operation='task_assign' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','taskId','userId','dueAt']);
  if not public.recruitment_case_staff_allowed((d->>'userId')::uuid,c.id,'review') or (d->>'dueAt')::timestamptz<=clock_timestamp() then raise exception 'access_denied';end if;
  update public.recruitment_onboarding_tasks set assigned_to=(d->>'userId')::uuid,due_at=(d->>'dueAt')::timestamptz where id=(d->>'taskId')::uuid and case_id=c.id and status<>'verified' returning id into new_id;
  if new_id is null then raise exception 'invalid_transition';end if;
 elsif p_operation='task_verify' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','taskId','documentId','evidenceReference']);
  select * into task from public.recruitment_onboarding_tasks where id=(d->>'taskId')::uuid and case_id=c.id for update;new_id=task.id;
  if task.id is null or task.status='verified' or coalesce(d->>'evidenceReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' then raise exception 'invalid_transition';end if;
  if task.kind<>'document' and d->>'documentId' is not null then raise exception 'invalid_request';end if;
  if task.kind='document' and not exists(select 1 from public.recruitment_case_documents where id=(d->>'documentId')::uuid and case_id=c.id and current and state='clean' and requirement_key=substring(task.key from 10)) then raise exception 'documents_not_clean';end if;
  if task.kind='agreement' and not exists(select 1 from public.recruitment_agreement_acceptances ac where ac.case_id=c.id and ac.offer_id=(select id from public.recruitment_offers where case_id=c.id and status='accepted') and ac.template_id=coalesce(task.template_id,case when task.key='agreement' then (select ov.agreement_template_id from public.recruitment_offer_versions ov join public.recruitment_offers oo on oo.id=ov.id where oo.case_id=c.id and oo.status='accepted') else null end)) then raise exception 'agreement_required';end if;
  if task.kind='declaration' and task.status<>'submitted' then raise exception 'candidate_acknowledgement_required';end if;
  update public.recruitment_onboarding_tasks set status='verified',document_id=(d->>'documentId')::uuid,evidence_reference=d->>'evidenceReference',verified_by=p_actor,verified_at=clock_timestamp() where id=task.id;
 elsif p_operation='session_payment_prepare' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','sessionIds','issuedOn','dueOn','approvalReference']);
  perform public.accounting_assert(p_actor);
  if jsonb_typeof(d->'sessionIds') is distinct from 'array' or jsonb_array_length(d->'sessionIds') not between 1 and 100 or coalesce(d->>'approvalReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' then raise exception 'invalid_request';end if;
  select * into a from public.recruitment_staff_engagements where case_id=c.id;
  select v1.* into v from public.recruitment_offer_versions v1 join public.recruitment_offers o1 on o1.id=v1.id where o1.case_id=c.id and o1.status='accepted';
  rate=(v.terms->>'sessionRateCents')::integer;session_ids=array(select jsonb_array_elements_text(d->'sessionIds'))::uuid[];
  if a.tutor_id is null or rate is null or rate<=0 or cardinality(session_ids)<>(select count(distinct value) from jsonb_array_elements(d->'sessionIds')) or exists(select 1 from unnest(session_ids) x where not exists(select 1 from public.teaching_sessions ts where ts.id=x and ts.tutor_id=a.tutor_id and ts.status='completed' and ts.starts_at>=a.activated_at and ts.ends_at<=clock_timestamp())) or exists(select 1 from public.recruitment_tutor_session_payments where session_id=any(session_ids)) then raise exception 'session_payment_ineligible';end if;
  perform 1 from public.teaching_sessions where id=any(session_ids) order by id for update;
  bill=public.accounting_mutate(p_actor,'bill',jsonb_build_object('requestId',rid,'category','5000','amountCents',rate::bigint*cardinality(session_ids),'issuedOn',d->>'issuedOn','dueOn',d->>'dueOn','supplierName',(select name from public.teaching_tutors where id=a.tutor_id),'description','Approved tutor sessions: '||(d->>'approvalReference'),'payNow',false));
  new_id=(bill->>'billId')::uuid;
  insert into public.recruitment_tutor_session_payments(session_id,case_id,bill_id,rate_cents,approved_by) select x,c.id,new_id,rate,p_actor from unnest(session_ids) x;
 elsif p_operation='activation_approve' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','userId','tutorId','displayName','subjects','grades','permissions','evidenceReference','personnelRetentionReviewAt']);
  uid=(d->>'userId')::uuid;tid=(d->>'tutorId')::uuid;
  if not exists(select 1 from public.recruitment_settings where singleton and activation_enabled) then raise exception 'activation_disabled';end if;
  if e.onboarding_started_at is null or exists(select 1 from public.recruitment_onboarding_tasks where case_id=c.id and required and status<>'verified') or not exists(select 1 from public.recruitment_onboarding_tasks where case_id=c.id) then raise exception 'onboarding_incomplete';end if;
  select * into o from public.recruitment_offers where case_id=c.id and status='accepted';select * into v from public.recruitment_offer_versions where id=o.id;
  if o.id is null or not exists(select 1 from public.recruitment_agreement_acceptances where case_id=c.id and template_id=v.agreement_template_id and offer_id=o.id) then raise exception 'agreement_required';end if;
  if not exists(select 1 from auth.users u join public.recruitment_case_contacts ct on ct.normalized_email=lower(btrim(u.email)) where u.id=uid and u.email_confirmed_at is not null and ct.case_id=c.id and ct.active) then raise exception 'identity_mismatch';end if;
  if exists(select 1 from public.recruitment_staff where user_id=uid and enabled) or exists(select 1 from public.admin_users au where au.user_id=uid and not (not au.enabled and au.finance_role='viewer' and exists(select 1 from public.recruitment_staff_engagements old_eng where old_eng.user_id=uid and old_eng.status='ended' and 'administration'=any(old_eng.permissions)))) then raise exception 'existing_privileged_identity';end if;
  if coalesce(d->>'evidenceReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' or not isfinite((d->>'personnelRetentionReviewAt')::timestamptz) or (d->>'personnelRetentionReviewAt')::timestamptz<=clock_timestamp() then raise exception 'personnel_retention_approval_required';end if;
  if length(btrim(coalesce(d->>'displayName',''))) not between 2 and 120 then raise exception 'invalid_request';end if;
  if jsonb_typeof(d->'subjects') is distinct from 'array' or jsonb_typeof(d->'grades') is distinct from 'array' or jsonb_typeof(d->'permissions') is distinct from 'array' or jsonb_array_length(d->'subjects')>20 or jsonb_array_length(d->'grades')>10 then raise exception 'invalid_request';end if;
  if e.category='tutor' then
   if d->'permissions'<>'[]'::jsonb or jsonb_array_length(d->'subjects')=0 or jsonb_array_length(d->'grades')=0 then raise exception 'invalid_permissions';end if;
   if (select count(distinct value) from jsonb_array_elements(d->'subjects'))<>jsonb_array_length(d->'subjects') or (select count(distinct value) from jsonb_array_elements(d->'grades'))<>jsonb_array_length(d->'grades') then raise exception 'invalid_request';end if;
   for subject_value in select jsonb_array_elements_text(d->'subjects') loop if subject_value not in ('Mathematics','Natural Sciences','Other academic support','Mathematical Literacy','Physical Sciences','Life Sciences') then raise exception 'invalid_subject';end if;end loop;
   for grade_value in select jsonb_array_elements_text(d->'grades') loop if not exists(select 1 from public.tuition_programmes where public.tuition_programmes.grade=grade_value) then raise exception 'invalid_grade';end if;end loop;
   if tid is not null and not exists(select 1 from public.teaching_tutors where id=tid and user_id=uid) then raise exception 'tutor_identity_mismatch';end if;
   if tid is null then
    select id into tid from public.teaching_tutors where user_id=uid;
    if tid is null then
     select normalized_email into contact from public.recruitment_case_contacts where case_id=c.id;
     if exists(select 1 from public.teaching_tutors where email=contact) then raise exception 'explicit_tutor_link_required';end if;
     insert into public.teaching_tutors(name,email,user_id,enabled) values(d->>'displayName',contact,uid,false) returning id into tid;
    end if;
   end if;
  elsif tid is not null or d->'subjects'<>'[]'::jsonb or d->'grades'<>'[]'::jsonb or (e.category='support_staff' and d->'permissions'<>'[]'::jsonb) or (e.category='administrator' and d->'permissions'<>'["administration"]'::jsonb) then raise exception 'invalid_permissions';end if;
  insert into public.recruitment_staff_engagements(case_id,user_id,tutor_id,status,subjects,grades,permissions,approved_by,activation_txid) values(c.id,uid,tid,'active',array(select jsonb_array_elements_text(d->'subjects')),array(select jsonb_array_elements_text(d->'grades')),array(select jsonb_array_elements_text(d->'permissions')),p_actor,txid_current());
  if tid is not null then update public.teaching_tutors set enabled=true where id=tid;end if;
  if e.category='administrator' then insert into public.admin_users(user_id,enabled,finance_role) values(uid,true,'viewer') on conflict(user_id) do update set enabled=true;end if;
  insert into public.recruitment_privacy_holds(case_id,purpose,reason_code,evidence_ref,placed_by,review_at) values(c.id,c.kind,'legal_obligation',d->>'evidenceReference',p_actor,(d->>'personnelRetentionReviewAt')::timestamptz);
  new_id=c.id;perform public.recruitment_engagement_notice(c.id,c.id||':activated');
 else
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','reason']||case when p_operation='offboard' then array['effectiveDate','replacementTutorId','reconciliationReference'] else '{}'::text[] end);
  select * into a from public.recruitment_staff_engagements where case_id=c.id for update;new_id=c.id;
  if a.case_id is null or a.status='ended' or length(btrim(d->>'reason')) not between 1 and 4000 then raise exception 'invalid_transition';end if;
  if p_operation='access_resume' then
   if a.status<>'suspended' then raise exception 'invalid_transition';end if;
   if not exists(select 1 from public.recruitment_settings where singleton and activation_enabled) then raise exception 'activation_disabled';end if;
   update public.recruitment_staff_engagements set status='active',activation_txid=txid_current() where case_id=c.id;
   if a.tutor_id is not null then update public.teaching_tutors set enabled=true where id=a.tutor_id;end if;
   if 'administration'=any(a.permissions) then update public.admin_users set enabled=true where user_id=a.user_id;end if;
  else
   if p_operation='offboard' then
    if (d->>'effectiveDate')::date>(clock_timestamp() at time zone 'Africa/Johannesburg')::date or (d->>'effectiveDate')::date<(a.activated_at at time zone 'Africa/Johannesburg')::date or coalesce(d->>'reconciliationReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' then raise exception 'invalid_offboarding';end if;
    if a.tutor_id is not null then
     if exists(select 1 from public.teaching_sessions ts where ts.tutor_id=a.tutor_id and ts.status='completed' and ts.starts_at>=a.activated_at and not exists(select 1 from public.recruitment_tutor_session_payments p where p.session_id=ts.id)) and coalesce((select (v1.terms->>'sessionRateCents')::integer from public.recruitment_offer_versions v1 join public.recruitment_offers o1 on o1.id=v1.id where o1.case_id=c.id and o1.status='accepted'),0)>0 then raise exception 'approved_sessions_require_reconciliation';end if;
     tid=(d->>'replacementTutorId')::uuid;
     if exists(select 1 from public.teaching_classes where tutor_id=a.tutor_id and not archived) or exists(select 1 from public.teaching_sessions where tutor_id=a.tutor_id and status='scheduled' and ends_at>clock_timestamp()) then
      if tid is null or tid=a.tutor_id or not exists(select 1 from public.teaching_tutors where id=tid and enabled) then raise exception 'responsibility_reassignment_required';end if;
      update public.teaching_classes set tutor_id=tid where tutor_id=a.tutor_id and not archived;
      update public.teaching_sessions set tutor_id=tid,revision=revision+1 where tutor_id=a.tutor_id and status='scheduled' and starts_at>clock_timestamp();
      if exists(select 1 from public.teaching_sessions where tutor_id=a.tutor_id and status='scheduled' and ends_at>clock_timestamp()) then raise exception 'active_session_requires_resolution';end if;
     end if;
    end if;
    update public.recruitment_staff_engagements set status='ended',ended_at=clock_timestamp(),ended_effective_on=(d->>'effectiveDate')::date,offboarding_reference=d->>'reconciliationReference' where case_id=c.id;
   else
    if a.status<>'active' then raise exception 'invalid_transition';end if;
    update public.recruitment_staff_engagements set status='suspended' where case_id=c.id;
   end if;
   if a.tutor_id is not null then update public.teaching_tutors set enabled=false where id=a.tutor_id;end if;
   if 'administration'=any(a.permissions) then update public.admin_users set enabled=false where user_id=a.user_id;end if;
  end if;
 end if;
 update public.recruitment_engagement_cases set revision=revision+1 where case_id=c.id returning revision into e.revision;
 result=jsonb_build_object('saved',true,'id',new_id,'revision',e.revision);
 insert into public.recruitment_engagement_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,result) values(c.id,'staff',p_actor,rid,p_operation,payload_digest,result);
 insert into public.recruitment_engagement_events(case_id,actor_kind,actor_id,action,request_id,revision,payload_digest) values(c.id,'staff',p_actor,p_operation,rid,e.revision,null);
 return result;
end$$;

create or replace function public.recruitment_engagement_applicant(p_hash text,p_action text,d jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;e public.recruitment_engagement_cases;o public.recruitment_offers;v public.recruitment_offer_versions;t public.recruitment_onboarding_tasks;r public.recruitment_engagement_requests;rid uuid;dg text;result jsonb;begin
 c=public.recruitment_case_session(p_hash);
 if not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and kind='applicant' and revoked_at is null) or c.state not in ('submitted','under_review','recommendation_recorded') or c.retention_due_at<=clock_timestamp() then raise exception 'case_unavailable';end if;
 if not exists(select 1 from public.recruitment_settings where singleton and onboarding_enabled) then raise exception 'onboarding_disabled';end if;
 select * into c from public.recruitment_cases where id=c.id for update;
 select * into e from public.recruitment_engagement_cases where case_id=c.id for update;
 if e.case_id is null then return jsonb_build_object('caseId',c.id,'revision',0,'offers','[]'::jsonb,'templates','[]'::jsonb,'tasks','[]'::jsonb,'acceptedTemplateIds','[]'::jsonb,'events','[]'::jsonb,'activation',null);end if;
 if p_action='read' then return public.recruitment_engagement_projection(c.id,false);end if;
 if p_action='recover' then
  perform public.recruitment_json_fields(d,array['requestId']);
  select * into r from public.recruitment_engagement_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=(d->>'requestId')::uuid;
  return case when r.request_id is null then jsonb_build_object('state','not_recorded') else r.result||jsonb_build_object('state','committed','operation',r.operation) end;
 end if;
 if p_action not in ('offer_accept','offer_decline','agreement_accept','task_complete') or jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>2048 then raise exception 'invalid_request';end if;
 perform public.recruitment_json_fields(d,array['requestId','expectedRevision']||case p_action when 'offer_accept' then array['offerId','acknowledged'] when 'offer_decline' then array['offerId'] when 'agreement_accept' then array['templateId','acknowledged'] else array['taskId','acknowledged'] end);rid=(d->>'requestId')::uuid;
 if rid is null or d->>'expectedRevision' is null then raise exception 'invalid_request';end if;
 dg=encode(sha256(convert_to(jsonb_build_object('operation',p_action,'data',d)::text,'UTF8')),'hex');
 select * into r from public.recruitment_engagement_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=rid;
 if r.request_id is not null then if r.operation<>p_action or r.payload_digest<>dg then raise exception 'request_conflict';end if;return r.result||'{"replayed":true}'::jsonb;end if;
 if e.revision<>(d->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 if p_action in ('offer_accept','offer_decline') then
  select * into o from public.recruitment_offers where id=(d->>'offerId')::uuid and case_id=c.id for update;
  select * into v from public.recruitment_offer_versions where id=o.id;
  if o.id is null or o.status<>'issued' or (v.terms->>'expiresAt')::timestamptz<=clock_timestamp() then raise exception 'offer_unavailable';end if;
  if p_action='offer_accept' and d->'acknowledged' is distinct from 'true'::jsonb then raise exception 'acknowledgement_required';end if;
  update public.recruitment_offers set status=case p_action when 'offer_accept' then 'accepted' else 'declined' end,responded_at=clock_timestamp(),accepted_at=case when p_action='offer_accept' then clock_timestamp() else null end where id=o.id;
  perform public.recruitment_engagement_notice(c.id,o.id||':'||p_action);
 elsif p_action='agreement_accept' then
  select o1.* into o from public.recruitment_offers o1 join public.recruitment_offer_versions v1 on v1.id=o1.id where o1.case_id=c.id and o1.status='accepted' and (v1.agreement_template_id=(d->>'templateId')::uuid or exists(select 1 from public.recruitment_onboarding_tasks ot where ot.case_id=c.id and ot.template_id=(d->>'templateId')::uuid));
  if o.id is null or d->'acknowledged' is distinct from 'true'::jsonb then raise exception 'agreement_unavailable';end if;
  insert into public.recruitment_agreement_acceptances(case_id,template_id,offer_id,request_id,terms_digest) values(c.id,(d->>'templateId')::uuid,o.id,rid,(select encode(sha256(convert_to(body,'UTF8')),'hex') from public.recruitment_agreement_templates where id=(d->>'templateId')::uuid));
 else
  select * into t from public.recruitment_onboarding_tasks where id=(d->>'taskId')::uuid and case_id=c.id for update;
  if t.id is null or t.kind<>'declaration' or t.status<>'pending' or d->'acknowledged' is distinct from 'true'::jsonb then raise exception 'invalid_transition';end if;
  update public.recruitment_onboarding_tasks set status='submitted',completed_at=clock_timestamp() where id=t.id;
 end if;
 update public.recruitment_engagement_cases set revision=revision+1 where case_id=c.id returning revision into e.revision;
 result=jsonb_build_object('saved',true,'revision',e.revision);
 insert into public.recruitment_engagement_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,result) values(c.id,'applicant',c.id,rid,p_action,dg,result);
 insert into public.recruitment_engagement_events(case_id,actor_kind,actor_id,action,request_id,revision,payload_digest) values(c.id,'applicant',c.id,p_action,rid,e.revision,null);
 return result;
end$$;
-- Existing legacy access fence remains closed except in the exact owner activation transaction.
create or replace function public.recruitment_guard_access() returns trigger
language plpgsql security definer set search_path='' as $$declare allowed boolean;begin
 if not exists(select 1 from public.recruitment_settings where singleton) then raise exception 'Recruitment configuration is missing.';end if;
 if not exists(select 1 from public.recruitment_settings where singleton and access_guards_enabled) then return new;end if;
 if tg_table_name='teaching_tutors' then
  if tg_op='INSERT' then new.enabled=false;
  elsif new.enabled and (not old.enabled or new.email is distinct from old.email) then
   select exists(select 1 from public.recruitment_staff_engagements a where a.tutor_id=new.id and a.user_id=new.user_id and a.status='active' and a.activation_txid=txid_current()) into allowed;
   if not allowed then raise exception 'Owner activation with verified onboarding is required.';end if;
  end if;
 elsif tg_table_name='admin_users' then
  if (tg_op='INSERT' and new.enabled) or (tg_op='UPDATE' and new.enabled and (not old.enabled or new.user_id is distinct from old.user_id or (case new.finance_role when 'owner' then 3 when 'bookkeeper' then 2 else 1 end)>(case old.finance_role when 'owner' then 3 when 'bookkeeper' then 2 else 1 end))) then
   select exists(select 1 from public.recruitment_staff_engagements a where a.user_id=new.user_id and a.status='active' and 'administration'=any(a.permissions) and a.activation_txid=txid_current() and new.finance_role='viewer') into allowed;
   if not allowed then raise exception 'New administrative permissions require reviewed owner activation.';end if;
  end if;
 end if;return new;
end$$;
-- Erasure removes case PII while minimal immutable governance events survive.
create or replace function public.recruitment_engagement_erase() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.state='purged' and old.state is distinct from new.state then
  if exists(select 1 from public.recruitment_staff_engagements where case_id=new.id and status<>'ended') then raise exception 'active_personnel_retention_required';end if;
  -- Ended staff access state is case-retained; authoritative tutor/session/accounting history survives.
  delete from public.recruitment_staff_engagements where case_id=new.id and status='ended';
  delete from public.recruitment_engagement_requests where case_id=new.id;
  delete from public.recruitment_onboarding_tasks where case_id=new.id;
  delete from public.recruitment_agreement_acceptances where case_id=new.id;
  -- Staff history uses opaque established identity references, not applicant documents or terms.
  delete from public.recruitment_offers where case_id=new.id;
  delete from public.recruitment_offer_versions where case_id=new.id;
 end if;return new;
end$$;
create trigger recruitment_engagement_erasure before update of state on public.recruitment_cases for each row execute function public.recruitment_engagement_erase();
revoke all on function public.recruitment_engagement_init(uuid),public.recruitment_engagement_projection(uuid,boolean),public.recruitment_engagement_read(uuid,uuid,text),public.recruitment_engagement_notice(uuid,text),public.recruitment_engagement_mutate(uuid,text,jsonb,text),public.recruitment_engagement_applicant(text,text,jsonb),public.recruitment_engagement_erase() from public,anon,authenticated,service_role;
grant execute on function public.recruitment_engagement_read(uuid,uuid,text),public.recruitment_engagement_mutate(uuid,text,jsonb,text),public.recruitment_engagement_applicant(text,text,jsonb) to service_role;

create or replace function public.recruitment_engagement_recover(p_actor uuid,p_case uuid,p_request uuid,p_aal text default 'aal1') returns jsonb
language plpgsql stable security definer set search_path='' as $$declare r public.recruitment_engagement_requests;begin
 perform public.recruitment_assert(p_actor);perform public.recruitment_require_assurance(p_actor,p_aal);
 select * into r from public.recruitment_engagement_requests where (p_case is null or case_id=p_case) and actor_kind='staff' and actor_id=p_actor and request_id=p_request;
 if r.case_id is not null then
  if r.operation in ('access_suspend','offboard','session_payment_prepare') then
   perform public.recruitment_assert(p_actor,true);
   if p_aal<>'aal2' or public.recruitment_case_conflicted(p_actor,r.case_id) then raise exception 'access_denied';end if;
  else perform public.recruitment_selection_assert(p_actor,r.case_id,p_aal,false);end if;
 elsif p_case is not null then perform public.recruitment_selection_assert(p_actor,p_case,p_aal,false);end if;
 return case when r.request_id is null then jsonb_build_object('state','not_recorded') else r.result||jsonb_build_object('state','committed','operation',r.operation) end;
end$$;
revoke all on function public.recruitment_engagement_recover(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_engagement_recover(uuid,uuid,uuid,text) to service_role;

create function public.recruitment_guard_offer_evidence() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then
  if not exists(select 1 from public.recruitment_cases c where c.id=old.case_id and c.state='deletion_pending' and c.deletion_barrier_at is not null) then raise exception 'immutable_evidence';end if;
  return old;
 end if;
 if (old.case_id,old.id) is distinct from (new.case_id,new.id) or (old.approved_at is not null and (old.approved_at,old.approved_by) is distinct from (new.approved_at,new.approved_by)) or (old.issued_at is not null and old.issued_at is distinct from new.issued_at) or (old.responded_at is not null and (old.responded_at,old.accepted_at) is distinct from (new.responded_at,new.accepted_at)) then raise exception 'immutable_evidence';end if;
 return new;
end$$;
create trigger recruitment_offer_evidence_guard before update or delete on public.recruitment_offers for each row execute function public.recruitment_guard_offer_evidence();
create trigger recruitment_offer_version_delete_guard before delete on public.recruitment_offer_versions for each row execute function public.recruitment_guard_offer_evidence();
create trigger recruitment_agreement_delete_guard before delete on public.recruitment_agreement_acceptances for each row execute function public.recruitment_guard_offer_evidence();
revoke all on function public.recruitment_guard_offer_evidence() from public,anon,authenticated,service_role;

-- Personnel revocation remains available after applicant retention or withdrawal, without
-- reopening the expired application, offer terms, identity documents or evaluations.
create function public.recruitment_engagement_personnel_read(p_actor uuid,p_case uuid,p_aal text default 'aal1') returns jsonb
language plpgsql stable security definer set search_path='' as $$declare e public.recruitment_engagement_cases;begin
 perform public.recruitment_assert(p_actor,true);perform public.recruitment_require_assurance(p_actor,p_aal);
 if p_aal<>'aal2' or public.recruitment_case_conflicted(p_actor,p_case) then raise exception 'access_denied';end if;
 select * into e from public.recruitment_engagement_cases where case_id=p_case;
 if e.case_id is null or not exists(select 1 from public.recruitment_staff_engagements where case_id=p_case) then raise exception 'case_unavailable';end if;
 return jsonb_build_object('caseId',e.case_id,'revision',e.revision,'category',e.category,'offers','[]'::jsonb,'templates','[]'::jsonb,'tasks','[]'::jsonb,'acceptedTemplateIds','[]'::jsonb,'events','[]'::jsonb,'activation',(select to_jsonb(a)-'activation_txid' from public.recruitment_staff_engagements a where a.case_id=p_case));
end$$;
create function public.recruitment_engagement_personnel_list(p_actor uuid,p_aal text default 'aal1') returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 perform public.recruitment_assert(p_actor,true);perform public.recruitment_require_assurance(p_actor,p_aal);
 if p_aal<>'aal2' then raise exception 'mfa_required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select e.case_id,e.category,e.revision,a.status,a.user_id,a.tutor_id,a.activated_at,a.ended_at from public.recruitment_engagement_cases e join public.recruitment_staff_engagements a on a.case_id=e.case_id where not public.recruitment_case_conflicted(p_actor,e.case_id) order by a.activated_at desc limit 100) x),'[]');
end$$;
revoke all on function public.recruitment_engagement_personnel_read(uuid,uuid,text),public.recruitment_engagement_personnel_list(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_engagement_personnel_read(uuid,uuid,text),public.recruitment_engagement_personnel_list(uuid,text) to service_role;

-- Only recruitment-bound tutors gain new restrictions; legacy staff and historical
-- completed sessions retain their original meaning. Check authoritative approved
-- subjects/grades at the existing scheduling tables, including offboarding reassignments.
create function public.recruitment_guard_teaching_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.recruitment_staff_engagements;g text;subject_name text;begin
 if tg_table_name='teaching_classes' then
  if new.archived then return new;end if;
  if tg_op='UPDATE' and (new.tutor_id,new.grade,new.subject,new.archived) is not distinct from (old.tutor_id,old.grade,old.subject,old.archived) then return new;end if;
  g=new.grade;subject_name=new.subject;
 else
  if new.status<>'scheduled' then return new;end if;
  if tg_op='UPDATE' and (new.tutor_id,new.class_id,new.starts_at,new.ends_at,new.status) is not distinct from (old.tutor_id,old.class_id,old.starts_at,old.ends_at,old.status) then return new;end if;
  select grade,subject into g,subject_name from public.teaching_classes where id=new.class_id;
 end if;
 -- Serialise concurrent scheduling with tutor disablement and other bookings.
 perform 1 from public.teaching_tutors where id=new.tutor_id for update;
 select * into a from public.recruitment_staff_engagements where tutor_id=new.tutor_id order by activated_at desc limit 1;
 if a.case_id is not null and (a.status<>'active' or not g=any(a.grades) or not subject_name=any(a.subjects) or not exists(select 1 from public.teaching_tutors where id=new.tutor_id and enabled)) then raise exception 'approved_teaching_scope_required';end if;
 if tg_table_name='teaching_sessions' then
  if exists(select 1 from public.teaching_sessions x where x.id<>new.id and x.tutor_id=new.tutor_id and x.status<>'cancelled' and x.starts_at<new.ends_at and x.ends_at>new.starts_at) then raise exception 'teaching_schedule_conflict';end if;
 end if;
 return new;
end$$;
create trigger recruitment_teaching_class_scope before insert or update on public.teaching_classes for each row execute function public.recruitment_guard_teaching_assignment();
create trigger recruitment_teaching_session_scope before insert or update on public.teaching_sessions for each row execute function public.recruitment_guard_teaching_assignment();
revoke all on function public.recruitment_guard_teaching_assignment() from public,anon,authenticated,service_role;

-- Existing administrative enrollment access is not permission to read the ledger.
-- Preserve legacy finance viewers; newly recruited administration-only identities
-- require a separately authorised finance role before accessing accounting reports.
create function public.recruitment_assert_accounting_read(p_actor uuid) returns void
language plpgsql stable security definer set search_path='' as $$begin
 perform public.admin_assert(p_actor);
 if exists(select 1 from public.recruitment_staff_engagements where user_id=p_actor and 'administration'=any(permissions)) and not exists(select 1 from public.admin_users where user_id=p_actor and finance_role in ('owner','bookkeeper')) then raise exception 'accounting_read_permission_required';end if;
end$$;
revoke all on function public.recruitment_assert_accounting_read(uuid) from public,anon,authenticated,service_role;
do $accounting_read_guards$
declare signature text;definition text;guard text='perform public.admin_assert(p_actor);';begin
 foreach signature in array array['public.accounting_snapshot(uuid,date,date)','public.accounting_document_data(uuid,text,uuid,date,date)','public.accounting_export_rows(uuid,text,date,date)'] loop
  if to_regprocedure(signature) is null then raise exception 'Missing accounting dependency: %',signature;end if;
  definition=pg_get_functiondef(to_regprocedure(signature));
  if (length(definition)-length(replace(definition,guard,'')))/length(guard)<>1 then raise exception 'Unsupported accounting read guard: %',signature;end if;
  execute replace(definition,guard,'perform public.recruitment_assert_accounting_read(p_actor);');
 end loop;
end $accounting_read_guards$;

-- END EXACT SOURCE: supabase/migrations/20261115020000_recruitment_engagement.sql

-- BEGIN EXACT SOURCE: supabase/migrations/20261115025000_recruitment_onboarding_documents.sql
-- SHA256 815edb89a7ae80c3e0a2c8749fd3b240887f5f561886e5886da1f19b9ec61343
-- M5 onboarding documents extend the established quarantine pipeline. No new
-- bucket, URL, scanner, object naming scheme or browser privilege is introduced.
-- Existing immutable submission manifests remain authoritative and unchanged.
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.recruitment_onboarding_tasks'::regclass and conname='recruitment_onboarding_task_case_identity') then
  alter table public.recruitment_onboarding_tasks add constraint recruitment_onboarding_task_case_identity unique(case_id,id);
 end if;
end$$;
create table if not exists public.recruitment_onboarding_document_links (
 document_id uuid primary key references public.recruitment_case_documents(id) on delete cascade,
 task_id uuid not null references public.recruitment_onboarding_tasks(id) on delete cascade,
 case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(case_id,document_id) references public.recruitment_case_documents(case_id,id) on delete cascade,
 foreign key(case_id,task_id) references public.recruitment_onboarding_tasks(case_id,id) on delete cascade
);
create index if not exists recruitment_onboarding_document_task on public.recruitment_onboarding_document_links(task_id);
alter table public.recruitment_onboarding_document_links enable row level security;
revoke all on public.recruitment_onboarding_document_links from public,anon,authenticated,service_role;

create or replace function public.recruitment_onboarding_upload_case(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_cases c join public.recruitment_engagement_cases e on e.case_id=c.id join public.recruitment_settings cfg on cfg.singleton
 where c.id=p_case and c.kind='vacancy' and c.state in ('submitted','under_review','recommendation_recorded')
 and c.deletion_barrier_at is null and c.retention_due_at>clock_timestamp() and public.recruitment_intake_ready()
 and cfg.onboarding_enabled and cfg.case_processing_enabled and cfg.document_uploads_enabled
 and cfg.scanner_attested_at is not null and cfg.scanner_policy_version is not null and e.onboarding_started_at is not null
 and exists(select 1 from public.recruitment_offers o where o.case_id=c.id and o.status='accepted')
 and not exists(select 1 from public.recruitment_staff_engagements a where a.case_id=c.id))
$$;
revoke all on function public.recruitment_onboarding_upload_case(uuid) from public,anon,authenticated,service_role;

create or replace function public.recruitment_document_scan_case(p_case uuid,p_document uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_cases c where c.id=p_case and c.deletion_barrier_at is null and c.retention_due_at>clock_timestamp()
  and (c.state='draft' or (public.recruitment_onboarding_upload_case(c.id) and exists(
   select 1 from public.recruitment_onboarding_document_links l join public.recruitment_onboarding_tasks t on t.id=l.task_id
   where l.document_id=p_document and l.case_id=c.id and t.case_id=c.id and t.kind='document' and t.status<>'verified'))))
$$;
revoke all on function public.recruitment_document_scan_case(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.recruitment_document_mutate(p_hash text,p_action text,d jsonb,p_digest text,p_key_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;f public.recruitment_intake_forms;doc public.recruitment_case_documents;r public.recruitment_case_requests;
 rid uuid;idx integer;bytes integer;expected integer;part jsonb;task_id uuid;onboarding boolean;begin
 c=public.recruitment_case_session(p_hash);
 perform 1 from public.recruitment_settings where singleton for share;
 if c.vacancy_id is not null then perform 1 from public.recruitment_vacancies where id=c.vacancy_id for share;end if;
 select * into c from public.recruitment_cases where id=c.id for update;
 c=public.recruitment_case_session(p_hash);
 onboarding=c.state<>'draft';
 if onboarding then
  if not public.recruitment_onboarding_upload_case(c.id) or not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and kind='applicant' and revoked_at is null) then raise exception 'case_unavailable';end if;
 else c=public.recruitment_case_session(p_hash,true);end if;
 if p_action<>'discard' and not exists(select 1 from public.recruitment_settings where singleton and document_uploads_enabled and scanner_attested_at is not null and scanner_policy_version is not null) then raise exception 'scanner_unavailable';end if;
 if p_action='discard' or onboarding then select * into f from public.recruitment_intake_forms where id=c.form_id;else f=public.recruitment_intake_form(c.kind,(select slug from public.recruitment_vacancies where id=c.vacancy_id));end if;
 if p_action<>'discard' and (not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) or not exists(select 1 from storage.buckets where id='recruitment-quarantine' and not public and file_size_limit=2097152 and allowed_mime_types=array['application/octet-stream']) or not exists(select 1 from storage.buckets where id='recruitment-documents' and not public and file_size_limit=10485760 and allowed_mime_types=array['application/pdf'])) then raise exception 'storage_unavailable';end if;
 if p_action='readiness' then return jsonb_build_object('policy',(select scanner_policy_version from public.recruitment_settings where singleton));end if;
 if f.id<>c.form_id then raise exception 'requirements_changed';end if;
 if p_action='reserve' then
  perform public.recruitment_json_fields(d,array['requestId','requirementKey','name','size','checksum']);rid=(d->>'requestId')::uuid;
  if p_digest !~ '^[0-9a-f]{64}$' or p_key_version<1 then raise exception 'invalid_request';end if;
  select * into r from public.recruitment_case_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=rid;
  if r.request_id is not null then
   if r.operation<>'reserve' or r.payload_digest<>p_digest or r.digest_key_version<>p_key_version then raise exception 'request_conflict';end if;
   select * into doc from public.recruitment_case_documents where id=r.result_ref and case_id=c.id;return jsonb_build_object('documentId',doc.id,'generation',doc.generation,'chunks',doc.chunks,'size',doc.declared_size);
  end if;
  if onboarding then
   select t.id into task_id from public.recruitment_onboarding_tasks t where t.case_id=c.id and t.key='document:'||(d->>'requirementKey') and t.kind='document' and t.status<>'verified' for update;
   if task_id is null then raise exception 'invalid_request';end if;
  elsif not exists(select 1 from jsonb_array_elements(f.definition->'requiredDocuments') q where q->>'key'=d->>'requirementKey') then raise exception 'invalid_request';end if;
  if (d->>'size')::integer not between 1 and 10485760 or d->>'checksum' !~ '^[0-9a-f]{64}$' then raise exception 'invalid_request';end if;
  if exists(select 1 from public.recruitment_case_documents where case_id=c.id and requirement_key=d->>'requirementKey' and current and state<>'deleted') then raise exception 'document_exists';end if;
  if (select count(*) from public.recruitment_case_documents where case_id=c.id and state<>'deleted')>=8
   or (select coalesce(sum(declared_size),0) from public.recruitment_case_documents where case_id=c.id and state<>'deleted')+(d->>'size')::integer>41943040 then raise exception 'document_quota';end if;
  insert into public.recruitment_case_documents(case_id,form_id,requirement_key,declared_name,declared_size,declared_checksum,quarantine_prefix)
  values(c.id,f.id,d->>'requirementKey',d->>'name',(d->>'size')::integer,d->>'checksum',gen_random_uuid()::text) returning * into doc;
  if onboarding then insert into public.recruitment_onboarding_document_links(document_id,task_id,case_id) values(doc.id,task_id,c.id);end if;
  insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,result_ref,expires_at)
  values(c.id,'applicant',c.id,rid,'reserve',p_digest,p_key_version,'committed',doc.id,c.retention_due_at);
  perform public.recruitment_case_log(c.id,'applicant',c.id,'document_reserved',rid,p_digest);
  return jsonb_build_object('documentId',doc.id,'generation',doc.generation,'chunks',doc.chunks,'size',doc.declared_size);
 end if;
 select * into doc from public.recruitment_case_documents where id=(d->>'documentId')::uuid and case_id=c.id and generation=(d->>'generation')::uuid for update;
 if doc.id is null or doc.form_id<>c.form_id then raise exception 'case_unavailable';end if;
 if onboarding and not exists(select 1 from public.recruitment_onboarding_document_links l join public.recruitment_onboarding_tasks t on t.id=l.task_id where l.document_id=doc.id and l.case_id=c.id and t.case_id=c.id and t.status<>'verified') then raise exception 'case_unavailable';end if;
 if p_action in ('chunk_plan','chunk_commit') then
  perform public.recruitment_json_fields(d,array['documentId','generation','index','size','checksum']);
  idx=(d->>'index')::integer;bytes=(d->>'size')::integer;
  expected=least(2097152,doc.declared_size-idx*2097152);
  if doc.state<>'reserved' or idx not between 0 and 4 or expected<=0 or bytes<>expected or d->>'checksum' !~ '^[0-9a-f]{64}$' then raise exception 'invalid_chunk';end if;
  part=doc.chunks->idx::text;
  if part is not null and part->>'checksum'<>d->>'checksum' then raise exception 'request_conflict';end if;
  if p_action='chunk_commit' and part is null then
   update public.recruitment_case_documents set chunks=chunks||jsonb_build_object(idx::text,jsonb_build_object('size',bytes,'checksum',d->>'checksum')) where id=doc.id;
  end if;
  return jsonb_build_object('path',doc.quarantine_prefix||'/'||idx::text,'complete',part is not null);
 elsif p_action='finalize' then
  perform public.recruitment_json_fields(d,array['documentId','generation']);
  if doc.state in ('uploaded','scanning','clean','scan_error') then return jsonb_build_object('state',doc.state);end if;
  if doc.state<>'reserved' or (select count(*) from jsonb_object_keys(doc.chunks))<>ceil(doc.declared_size/2097152.0)::integer then raise exception 'upload_incomplete';end if;
  update public.recruitment_case_documents set state='uploaded',finalized_at=clock_timestamp() where id=doc.id;
  insert into public.recruitment_document_scans(document_id,generation) values(doc.id,doc.generation) on conflict do nothing;
  update public.recruitment_cases set last_activity_at=clock_timestamp(),revision=revision+1 where id=c.id;
  return jsonb_build_object('state','uploaded');
 elsif p_action='discard' then
  perform public.recruitment_json_fields(d,array['documentId','generation']);
  update public.recruitment_case_documents set state='discarded',current=false where id=doc.id;
  update public.recruitment_document_scans set state='cancelled',claim_id=null,lease_until=null where document_id=doc.id;
  return jsonb_build_object('discarded',true);
 end if;raise exception 'invalid_request';
end$$;

create or replace function public.recruitment_scan_claim(p_claim uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare job public.recruitment_document_scans;doc public.recruitment_case_documents;begin
 if not exists(select 1 from public.recruitment_settings where singleton and document_uploads_enabled and scanner_attested_at is not null) then return null;end if;
 select s.* into job from public.recruitment_document_scans s join public.recruitment_case_documents d on d.id=s.document_id join public.recruitment_cases c on c.id=d.case_id
 where (s.state='pending' or (s.state='claimed' and s.lease_until<clock_timestamp())) and s.attempts<5 and s.available_at<=clock_timestamp()
 and d.current and d.state in ('uploaded','scan_error','scanning') and public.recruitment_document_scan_case(c.id,d.id) and c.retention_due_at>clock_timestamp()
 order by s.available_at,s.id limit 1;
 if job.id is null then return null;end if;
 perform 1 from public.recruitment_settings where singleton for share;
 perform 1 from public.recruitment_vacancies where id=(select vacancy_id from public.recruitment_cases where id=(select case_id from public.recruitment_case_documents where id=job.document_id)) for share;
 perform 1 from public.recruitment_cases where id=(select case_id from public.recruitment_case_documents where id=job.document_id) and public.recruitment_document_scan_case(id,job.document_id) and retention_due_at>clock_timestamp() and deletion_barrier_at is null for update skip locked;
 if not found then return null;end if;
 select * into job from public.recruitment_document_scans where id=job.id and (state='pending' or (state='claimed' and lease_until<clock_timestamp())) for update skip locked;
 if job.id is null then return null;end if;
 update public.recruitment_document_scans set state='claimed',claim_id=p_claim,lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1 where id=job.id;
 update public.recruitment_case_documents set state='scanning' where id=job.document_id returning * into doc;
 return jsonb_build_object('jobId',job.id,'documentId',doc.id,'generation',doc.generation,'prefix',doc.quarantine_prefix,'chunks',doc.chunks,'size',doc.declared_size,'checksum',doc.declared_checksum,'cleanPath',doc.generation::text||'/'||p_claim::text||'.pdf');
end$$;

create or replace function public.recruitment_scan_complete(p_job uuid,p_claim uuid,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare job public.recruitment_document_scans;doc public.recruitment_case_documents;c public.recruitment_cases;cfg public.recruitment_settings;begin
 perform public.recruitment_json_fields(d,array['verdict','checksum','size','engine','definitions','policy','cleanPath']);
 select * into cfg from public.recruitment_settings where singleton for share;
 select * into job from public.recruitment_document_scans where id=p_job;
 select * into doc from public.recruitment_case_documents where id=job.document_id;
 if doc.id is null then return jsonb_build_object('accepted',false);end if;
 if doc.case_id is not null then perform 1 from public.recruitment_vacancies where id=(select vacancy_id from public.recruitment_cases where id=doc.case_id) for share;end if;
 select * into c from public.recruitment_cases where id=doc.case_id for update;
 select * into job from public.recruitment_document_scans where id=p_job for update;
 select * into doc from public.recruitment_case_documents where id=job.document_id for update;
 if job.state='complete' and job.claim_id=p_claim and doc.clean_path=d->>'cleanPath' and doc.checksum=d->>'checksum' then return jsonb_build_object('accepted',true);end if;
 if job.state<>'claimed' or job.claim_id is distinct from p_claim or job.lease_until<=clock_timestamp() or job.generation<>doc.generation then return jsonb_build_object('accepted',false);end if;
 if not cfg.document_uploads_enabled or not public.recruitment_document_scan_case(c.id,doc.id) or c.retention_due_at<=clock_timestamp() or c.deletion_barrier_at is not null or not doc.current or doc.state<>'scanning' then
  update public.recruitment_document_scans set state='cancelled' where id=job.id;return jsonb_build_object('accepted',false);end if;
 if d->>'verdict'='clean' and (d->>'checksum'<>doc.declared_checksum or (d->>'size')::integer<>doc.declared_size or nullif(d->>'engine','') is null or nullif(d->>'definitions','') is null or d->>'policy' is distinct from cfg.scanner_policy_version or d->>'cleanPath' is distinct from doc.generation::text||'/'||p_claim::text||'.pdf') then raise exception 'scan_integrity_failure';end if;
 if d->>'verdict' not in ('clean','infected','error') then raise exception 'scan_integrity_failure';end if;
 update public.recruitment_case_documents set state=case d->>'verdict' when 'clean' then 'clean' when 'infected' then 'rejected' else 'scan_error' end,
  clean_path=case when d->>'verdict'='clean' then d->>'cleanPath' else null end,checksum=d->>'checksum',actual_size=(d->>'size')::integer,
  scan_engine=d->>'engine',scan_definitions=d->>'definitions',scan_policy=d->>'policy' where id=doc.id;
 update public.recruitment_document_scans set state=case when d->>'verdict'='error' and attempts<5 then 'pending' when d->>'verdict'='error' then 'failed' else 'complete' end,
  verdict=d->>'verdict',checksum=d->>'checksum',engine=d->>'engine',definitions=d->>'definitions',policy=d->>'policy',completed_at=clock_timestamp(),claim_id=case when d->>'verdict'='error' then null else p_claim end,lease_until=null,available_at=clock_timestamp()+interval '1 minute' where id=job.id;
 perform public.recruitment_case_log(c.id,'worker',null,case when d->>'verdict'='clean' then 'document_clean' else 'document_rejected' end);
 return jsonb_build_object('accepted',true);
end$$;
create or replace function public.recruitment_scan_promote(p_job uuid,p_claim uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_document_scans s join public.recruitment_case_documents d on d.id=s.document_id join public.recruitment_cases c on c.id=d.case_id join public.recruitment_settings cfg on cfg.singleton
 where s.id=p_job and s.claim_id=p_claim and s.state='claimed' and s.lease_until>clock_timestamp() and d.current and d.state='scanning'
 and public.recruitment_document_scan_case(c.id,d.id) and cfg.document_uploads_enabled and cfg.scanner_attested_at is not null)
$$;

-- Submitted form documents are pinned and never cleaned by an upload retry.
-- Only unpinned onboarding uploads follow the existing six-minute grace sweep.
create or replace function public.recruitment_discarded_documents() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'prefix',quarantine_prefix,'cleanPrefix',generation::text)),'[]') from
 (select d.* from public.recruitment_case_documents d where d.state in ('discarded','rejected') and d.created_at<clock_timestamp()-interval '6 minutes'
 and not exists(select 1 from public.recruitment_document_scans s where s.document_id=d.id and s.state='claimed' and s.lease_until>clock_timestamp())
 and (not exists(select 1 from public.recruitment_submissions where case_id=d.case_id) or
 (exists(select 1 from public.recruitment_onboarding_document_links l where l.document_id=d.id)
  and not exists(select 1 from public.recruitment_submissions s where s.case_id=d.case_id and s.documents @> jsonb_build_array(jsonb_build_object('id',d.id)))))
 order by d.created_at,d.id limit 8)d
$$;
create or replace function public.recruitment_discard_complete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.recruitment_case_documents d set state='deleted',current=false,deleted_at=clock_timestamp() where d.id=p_id and d.state in ('discarded','rejected') and d.created_at<clock_timestamp()-interval '6 minutes'
 and not exists(select 1 from public.recruitment_document_scans j where j.document_id=d.id and j.state='claimed' and j.lease_until>clock_timestamp())
 and (not exists(select 1 from public.recruitment_submissions where case_id=d.case_id) or
 (exists(select 1 from public.recruitment_onboarding_document_links l where l.document_id=d.id)
 and not exists(select 1 from public.recruitment_submissions s where s.case_id=d.case_id and s.documents @> jsonb_build_array(jsonb_build_object('id',d.id)))));
end$$;

-- CREATE OR REPLACE retains existing service-role-only grants. New helpers and
-- link tables are internal and cannot be invoked or written from a browser.
revoke all on function public.recruitment_document_mutate(text,text,jsonb,text,integer),public.recruitment_scan_claim(uuid),public.recruitment_scan_complete(uuid,uuid,jsonb),public.recruitment_scan_promote(uuid,uuid),public.recruitment_discarded_documents(),public.recruitment_discard_complete(uuid) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_document_mutate(text,text,jsonb,text,integer),public.recruitment_scan_claim(uuid),public.recruitment_scan_complete(uuid,uuid,jsonb),public.recruitment_scan_promote(uuid,uuid),public.recruitment_discarded_documents(),public.recruitment_discard_complete(uuid) to service_role;

-- END EXACT SOURCE: supabase/migrations/20261115025000_recruitment_onboarding_documents.sql

-- BEGIN EXACT SOURCE: supabase/migrations/20261115030000_recruitment_lifecycle_workers.sql
-- SHA256 c7d6462d7f319f0962b4ad486de583f0b17a981a5b21997594d83345557d9e89
-- M4/M5 lifecycle scheduling through the existing authenticated worker.
-- Additive; no flags, scheduler, recipient policy, or live configuration enabled.
alter table public.recruitment_email_outbox drop constraint recruitment_email_outbox_template_check;
alter table public.recruitment_email_outbox add constraint recruitment_email_outbox_template_check check(template in
 ('verify','receipt','clarification','pool_renewal','staff_received','staff_assignment','selection_status','engagement_status','interview_reminder','offer_reminder','offer_expired','onboarding_reminder'));

-- Durable deduplication survives normal outbox pruning. No message body, recipient
-- or applicant attributes are retained; entries are removed with case erasure.
create table public.recruitment_lifecycle_notifications (
 message_key text primary key,case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 template text not null,queued_at timestamptz not null default clock_timestamp()
);
create index recruitment_lifecycle_notification_case on public.recruitment_lifecycle_notifications(case_id);
alter table public.recruitment_lifecycle_notifications enable row level security;
revoke all on public.recruitment_lifecycle_notifications from public,anon,authenticated,service_role;
create function public.recruitment_lifecycle_enqueue(p_case uuid,p_template text,p_key text,p_expires timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$begin
 insert into public.recruitment_lifecycle_notifications(message_key,case_id,template) values(p_key,p_case,p_template) on conflict(message_key) do nothing;
 if not found then return false;end if;
 insert into public.recruitment_email_outbox(case_id,template,message_key,expires_at) values(p_case,p_template,p_key,p_expires) on conflict(message_key) do nothing;
 return true;
end$$;
create function public.recruitment_lifecycle_erase() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.state='purged' and old.state is distinct from new.state then delete from public.recruitment_lifecycle_notifications where case_id=new.id;end if;return new;
end$$;
create trigger recruitment_lifecycle_erasure before update of state on public.recruitment_cases for each row execute function public.recruitment_lifecycle_erase();

create function public.recruitment_lifecycle_case_active(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_cases c where c.id=p_case and c.kind='vacancy'
 and c.state in ('submitted','under_review','recommendation_recorded') and c.deletion_barrier_at is null and c.retention_due_at>clock_timestamp())
$$;

-- Evaluate source state again at dispatch time; queueing a reminder grants no
-- authority to deliver it after a cancellation, replacement, withdrawal or purge.
create function public.recruitment_lifecycle_mail_current(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m public.recruitment_email_outbox; cfg public.recruitment_settings;begin
 select * into m from public.recruitment_email_outbox where id=p_id;
 select * into cfg from public.recruitment_settings where singleton;
 if m.template not in ('selection_status','engagement_status','interview_reminder','offer_reminder','offer_expired','onboarding_reminder') then return true;end if;
 if not cfg.case_processing_enabled or not public.recruitment_lifecycle_case_active(m.case_id) then return false;end if;
 if m.template in ('selection_status','interview_reminder') and not cfg.selection_enabled then return false;end if;
 if m.template in ('engagement_status','offer_reminder','offer_expired','onboarding_reminder') and not cfg.onboarding_enabled then return false;end if;
 if m.template='interview_reminder' then
  return exists(select 1 from public.recruitment_selection_interviews i where i.case_id=m.case_id and i.status='scheduled'
   and i.candidate_response is distinct from 'reschedule_requested' and i.starts_at>clock_timestamp()
   and m.message_key='interview:'||i.id::text||':'||(extract(epoch from i.starts_at)::bigint)::text||':reminder');
 elsif m.template='offer_reminder' then
  return exists(select 1 from public.recruitment_offers o join public.recruitment_offer_versions v on v.id=o.id
   where o.case_id=m.case_id and o.status='issued' and (v.terms->>'expiresAt')::timestamptz>clock_timestamp() and m.message_key='offer:'||o.id::text||':reminder');
 elsif m.template='offer_expired' then
  return exists(select 1 from public.recruitment_offers o where o.case_id=m.case_id and o.status='expired' and m.message_key='offer:'||o.id::text||':expired');
 elsif m.template='onboarding_reminder' then
  return exists(select 1 from public.recruitment_onboarding_tasks t join public.recruitment_engagement_cases e on e.case_id=t.case_id
   where t.case_id=m.case_id and t.required and t.status<>'verified' and e.onboarding_started_at is not null
   and not exists(select 1 from public.recruitment_staff_engagements a where a.case_id=t.case_id)
   and exists(select 1 from public.recruitment_offers x where x.case_id=t.case_id and x.status='accepted')
   and m.message_key='onboarding:'||t.id::text||':'||(extract(epoch from coalesce(t.due_at,e.onboarding_started_at+interval '24 hours'))::bigint)::text||':reminder');
 end if;return true;
end$$;

create or replace function public.recruitment_mail_authorize(p_id uuid,p_claim uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$declare m public.recruitment_email_outbox;begin
 select * into m from public.recruitment_email_outbox where id=p_id and claim_id=p_claim and status='claimed' and lease_until>clock_timestamp() and expires_at>clock_timestamp();
 if m.id is null or not exists(select 1 from public.recruitment_settings where singleton and applicant_email_enabled) then return false;end if;
 if m.challenge_id is not null and not exists(select 1 from public.recruitment_email_challenges where id=m.challenge_id and consumed_at is null and revoked_at is null and expires_at>clock_timestamp()) then return false;end if;
 if m.case_id is not null and not exists(select 1 from public.recruitment_cases where id=m.case_id and state in ('draft','submitted','under_review','recommendation_recorded') and deletion_barrier_at is null and retention_due_at>clock_timestamp()) then return false;end if;
 if m.recipient_staff_id is not null and (not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled) or not public.recruitment_case_staff_allowed(m.recipient_staff_id,m.case_id,'read')) then return false;end if;
 return public.recruitment_lifecycle_mail_current(p_id);
end$$;

create function public.recruitment_lifecycle_tick(p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.recruitment_settings;r record;c public.recruitment_cases;e public.recruitment_engagement_cases;o public.recruitment_offers;
 interviews integer=0;expired integer=0;offers integer=0;onboarding integer=0;begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'invalid_request';end if;
 -- Only concurrent scheduler ticks share this lock. Business commands keep their
 -- existing case -> engagement -> offer lock order.
 if not pg_try_advisory_xact_lock(hashtext('viva.recruitment.lifecycle')::bigint) then
  return jsonb_build_object('interviewsReminded',0,'offersExpired',0,'offersReminded',0,'onboardingReminded',0);end if;
 select * into cfg from public.recruitment_settings where singleton;
 if not cfg.case_processing_enabled then
  return jsonb_build_object('interviewsReminded',0,'offersExpired',0,'offersReminded',0,'onboardingReminded',0);end if;
 if cfg.onboarding_enabled then
  for r in select x.id,x.case_id from public.recruitment_offers x join public.recruitment_offer_versions v on v.id=x.id
   where x.status='issued' and (v.terms->>'expiresAt')::timestamptz<=clock_timestamp() and public.recruitment_lifecycle_case_active(x.case_id)
   order by x.id limit p_limit loop
   select * into c from public.recruitment_cases where id=r.case_id for update skip locked;
   if not found or not public.recruitment_lifecycle_case_active(c.id) then continue;end if;
   select * into e from public.recruitment_engagement_cases where case_id=c.id for update;
   select * into o from public.recruitment_offers where id=r.id for update;
   if o.status<>'issued' or not exists(select 1 from public.recruitment_offer_versions v where v.id=o.id and (v.terms->>'expiresAt')::timestamptz<=clock_timestamp()) then continue;end if;
   update public.recruitment_offers set status='expired',responded_at=clock_timestamp() where id=o.id;
   update public.recruitment_engagement_cases set revision=revision+1 where case_id=c.id returning * into e;
   insert into public.recruitment_engagement_events(case_id,actor_kind,action,revision) values(c.id,'worker','offer_expire',e.revision);
   perform public.recruitment_lifecycle_enqueue(c.id,'offer_expired','offer:'||o.id::text||':expired',clock_timestamp()+interval '24 hours');
   expired=expired+1;
  end loop;
 end if;
 -- Email switches never prevent authoritative offer deadlines from being enforced.
 if cfg.applicant_email_enabled then
  if cfg.selection_enabled then
   for r in select i.case_id,'interview:'||i.id::text||':'||(extract(epoch from i.starts_at)::bigint)::text||':reminder' as key,i.starts_at as deadline
   from public.recruitment_selection_interviews i where i.status='scheduled' and i.candidate_response is distinct from 'reschedule_requested'
   and i.starts_at>clock_timestamp() and i.starts_at<=clock_timestamp()+interval '24 hours' and public.recruitment_lifecycle_case_active(i.case_id)
   and not exists(select 1 from public.recruitment_lifecycle_notifications m where m.message_key='interview:'||i.id::text||':'||(extract(epoch from i.starts_at)::bigint)::text||':reminder')
   order by i.starts_at,i.id limit p_limit loop
    if public.recruitment_lifecycle_enqueue(r.case_id,'interview_reminder',r.key,r.deadline) then interviews=interviews+1;end if;
   end loop;
  end if;
  if cfg.onboarding_enabled then
   for r in select x.case_id,'offer:'||x.id::text||':reminder' as key,(v.terms->>'expiresAt')::timestamptz as deadline
   from public.recruitment_offers x join public.recruitment_offer_versions v on v.id=x.id where x.status='issued'
   and (v.terms->>'expiresAt')::timestamptz>clock_timestamp() and (v.terms->>'expiresAt')::timestamptz<=clock_timestamp()+interval '24 hours'
   and public.recruitment_lifecycle_case_active(x.case_id)
   and not exists(select 1 from public.recruitment_lifecycle_notifications m where m.message_key='offer:'||x.id::text||':reminder')
   order by (v.terms->>'expiresAt')::timestamptz,x.id limit p_limit loop
    if public.recruitment_lifecycle_enqueue(r.case_id,'offer_reminder',r.key,r.deadline) then offers=offers+1;end if;
   end loop;
   for r in select t.case_id,'onboarding:'||t.id::text||':'||(extract(epoch from coalesce(t.due_at,g.onboarding_started_at+interval '24 hours'))::bigint)::text||':reminder' as key
   from public.recruitment_onboarding_tasks t join public.recruitment_engagement_cases g on g.case_id=t.case_id
   where t.required and t.status<>'verified' and g.onboarding_started_at is not null
   and coalesce(t.due_at,g.onboarding_started_at+interval '24 hours')<=clock_timestamp()+interval '24 hours'
   and not exists(select 1 from public.recruitment_staff_engagements a where a.case_id=t.case_id)
   and exists(select 1 from public.recruitment_offers x where x.case_id=t.case_id and x.status='accepted')
   and public.recruitment_lifecycle_case_active(t.case_id)
   and not exists(select 1 from public.recruitment_lifecycle_notifications m where m.message_key='onboarding:'||t.id::text||':'||(extract(epoch from coalesce(t.due_at,g.onboarding_started_at+interval '24 hours'))::bigint)::text||':reminder')
   order by coalesce(t.due_at,g.onboarding_started_at+interval '24 hours'),t.id limit p_limit loop
    if public.recruitment_lifecycle_enqueue(r.case_id,'onboarding_reminder',r.key,clock_timestamp()+interval '24 hours') then onboarding=onboarding+1;end if;
   end loop;
  end if;
 end if;
 -- Withdrawn or changed reminders are cancelled, not sent using stale queue data.
 update public.recruitment_email_outbox m set status='cancelled',envelope=null,claim_id=null,lease_until=null
 where m.id in(select j.id from public.recruitment_email_outbox j where j.status in ('pending','claimed')
  and j.template in ('interview_reminder','offer_reminder','offer_expired','onboarding_reminder')
  and not public.recruitment_lifecycle_mail_current(j.id) order by j.created_at limit p_limit);
 return jsonb_build_object('interviewsReminded',interviews,'offersExpired',expired,'offersReminded',offers,'onboardingReminded',onboarding);
end$$;

revoke all on function public.recruitment_lifecycle_case_active(uuid),public.recruitment_lifecycle_mail_current(uuid),public.recruitment_lifecycle_tick(integer) from public,anon,authenticated,service_role;
revoke all on function public.recruitment_lifecycle_enqueue(uuid,text,text,timestamptz),public.recruitment_lifecycle_erase() from public,anon,authenticated,service_role;
grant execute on function public.recruitment_lifecycle_tick(integer) to service_role;

-- Scoped lifecycle reporting extends selection without exposing individual terms,
-- evaluations, bank details or private staff attributes through aggregates.
create function public.recruitment_lifecycle_summary(p_actor uuid,p_aal text) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare base jsonb;begin
 base=public.recruitment_selection_summary(p_actor,p_aal);
 if coalesce((base->>'enabled')::boolean,false)=false then return base;end if;
 return base||jsonb_build_object(
  'offersIssued',(select count(*)::integer from public.recruitment_offers o where o.issued_at is not null and public.recruitment_case_staff_allowed(p_actor,o.case_id,'read')),
  'offersAccepted',(select count(*)::integer from public.recruitment_offers o where o.status='accepted' and public.recruitment_case_staff_allowed(p_actor,o.case_id,'read')),
  'offersDeclined',(select count(*)::integer from public.recruitment_offers o where o.status='declined' and public.recruitment_case_staff_allowed(p_actor,o.case_id,'read')),
  'onboarding',(select count(*)::integer from public.recruitment_engagement_cases e where e.onboarding_started_at is not null and not exists(select 1 from public.recruitment_staff_engagements a where a.case_id=e.case_id) and public.recruitment_case_staff_allowed(p_actor,e.case_id,'read')),
  'activations',(select count(*)::integer from public.recruitment_staff_engagements a where public.recruitment_case_staff_allowed(p_actor,a.case_id,'read')),
  'onboardingProgress',coalesce((select jsonb_agg(to_jsonb(x)) from (select t.status,count(*)::integer count from public.recruitment_onboarding_tasks t where public.recruitment_case_staff_allowed(p_actor,t.case_id,'read') group by t.status)x),'[]'::jsonb),
  'screeningCompleted',(select count(*)::integer from public.recruitment_selection_cases s where public.recruitment_case_staff_allowed(p_actor,s.case_id,'read') and exists(select 1 from public.recruitment_selection_screenings x where x.id=(select last.id from public.recruitment_selection_screenings last where last.case_id=s.case_id order by last.created_at desc,last.id desc limit 1) and not exists(select 1 from jsonb_array_elements(x.checks) item where item->'complete' is distinct from 'true'::jsonb)))
 );
end$$;
revoke all on function public.recruitment_lifecycle_summary(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_lifecycle_summary(uuid,text) to service_role;


-- Replace historical hard-coded unavailable labels with authoritative switches.
-- Recorded configuration is not acceptance of real delivery, scanning or recovery.
create or replace function public.recruitment_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;begin
 s=public.recruitment_assert(p_actor);
 return jsonb_build_object('user',public.recruitment_context(p_actor),'settings',(select to_jsonb(c)-'bootstrapped_at' from public.recruitment_settings c where singleton),
 'features',(select jsonb_build_object('publicVacancies',c.public_vacancies_enabled,'talentPool',c.talent_pool_intake_enabled and public.recruitment_intake_ready(),'applications',c.vacancy_intake_enabled and public.recruitment_intake_ready(),'uploads',c.document_uploads_enabled and public.recruitment_intake_ready(),'emailDispatch',c.applicant_email_enabled,'interviews',c.selection_enabled and c.case_processing_enabled,'decisions',c.selection_enabled and c.case_processing_enabled,'onboarding',c.onboarding_enabled and c.case_processing_enabled,'activation',c.activation_enabled and c.onboarding_enabled and c.selection_enabled and c.case_processing_enabled,'compensation',false) from public.recruitment_settings c where c.singleton),
 'staff',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('email',u.email) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id) when s.role='manager' then (select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'email',u.email,'role',r.role,'enabled',r.enabled) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id where r.role='officer' and r.enabled and exists(
   select 1 from public.recruitment_staff_scopes mg join public.recruitment_staff_scopes og on og.scope_id=mg.scope_id
   where mg.user_id=p_actor and mg.enabled and og.user_id=r.user_id )) else '[]'::jsonb end,
 'scopes',(select coalesce(jsonb_agg(to_jsonb(c) order by label),'[]') from public.recruitment_scopes c where s.role='owner' or exists(select 1 from public.recruitment_staff_scopes g where g.scope_id=c.id and g.user_id=p_actor and g.enabled)),
 'grants',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from public.recruitment_staff_scopes g where s.role='owner' or g.user_id=p_actor or (s.role='manager' and exists(select 1 from public.recruitment_staff_scopes own where own.user_id=p_actor and own.scope_id=g.scope_id and own.enabled))),
 'events',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]') from(select * from public.recruitment_events order by created_at desc,id limit 200)e) else '[]'::jsonb end);
end$$;

-- END EXACT SOURCE: supabase/migrations/20261115030000_recruitment_lifecycle_workers.sql

-- BEGIN EXACT SOURCE: supabase/migrations/20261115040000_recruitment_lifecycle_recovery.sql
-- SHA256 b30eeb2171342d8a37737a582976a9c63c0d6a1cab8962f5001e0df18b6d85fe
-- Transactional cancellation of an uncertain M4/M5 request after browser reload.
-- No credentials, candidate content, evaluation text or offer terms are retained.
-- Tombstones must survive delayed original requests. Applicant-linked tombstones
-- follow existing case/evidence erasure; case-free staff UUIDs are minimal staff
-- governance evidence. Do not expire them under an invented retention policy.
create table public.recruitment_lifecycle_cancellations (
 actor_kind text not null check(actor_kind in ('staff','applicant')),
 actor_id uuid not null,domain text not null check(domain in ('selection','engagement')),
 request_id uuid not null,case_id uuid references public.recruitment_cases(id) on delete cascade,
 action text not null default 'request_cancelled' check(action='request_cancelled'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_kind,actor_id,domain,request_id),
 check(actor_kind<>'applicant' or case_id=actor_id)
);
create index recruitment_lifecycle_cancel_case on public.recruitment_lifecycle_cancellations(case_id) where case_id is not null;
alter table public.recruitment_lifecycle_cancellations enable row level security;
revoke all on public.recruitment_lifecycle_cancellations from public,anon,authenticated,service_role;
create trigger recruitment_lifecycle_cancel_immutable before update on public.recruitment_lifecycle_cancellations for each row execute function public.recruitment_immutable();

-- Called ONLY from the protected existing functions. This request lock is taken
-- before their case/request locks. Cancellation either sees a committed original
-- or blocks every delayed prepare/mutate, including a request still authenticating.
create function public.recruitment_lifecycle_request_check(p_kind text,p_actor uuid,p_domain text,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 if p_kind is null or p_kind not in ('staff','applicant') or p_actor is null or p_domain is null or p_domain not in ('selection','engagement') or p_request is null then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('recruitment-lifecycle:'||p_kind||':'||p_actor::text||':'||p_domain||':'||p_request::text,0));
 if exists(select 1 from public.recruitment_lifecycle_cancellations where actor_kind=p_kind and actor_id=p_actor and domain=p_domain and request_id=p_request) then raise exception 'request_cancelled';end if;
end$$;
revoke all on function public.recruitment_lifecycle_request_check(text,uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.recruitment_lifecycle_cancel(p_domain text,p_request uuid,p_actor uuid default null,p_hash text default null,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;kind text;actor uuid;linked_case uuid;committed boolean=false;begin
 if p_domain is null or p_domain not in ('selection','engagement') or p_request is null or (p_actor is null)=(p_hash is null) then raise exception 'invalid_request';end if;
 if p_hash is not null then
  c=public.recruitment_case_session(p_hash);
  if not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and public.recruitment_applicant_sessions.kind='applicant' and revoked_at is null) or c.state not in ('submitted','under_review','recommendation_recorded') or c.retention_due_at<=clock_timestamp() then raise exception 'case_unavailable';end if;
  kind='applicant';actor=c.id;linked_case=c.id;
 else
  perform public.recruitment_assert(p_actor);perform public.recruitment_require_assurance(p_actor,p_aal);
  kind='staff';actor=p_actor;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('recruitment-lifecycle:'||kind||':'||actor::text||':'||p_domain||':'||p_request::text,0));
 -- Only operation metadata is returned. Lost case scopes cannot reveal result
 -- records, offer IDs, applicant data or otherwise grant review authority.
 if p_domain='selection' then
  select case_id into linked_case from public.recruitment_selection_requests where actor_id=actor and request_id=p_request and (kind='staff' or case_id=c.id);
  committed=found;
  if not committed and kind='staff' then select case_id into linked_case from public.recruitment_selection_confirmations where actor_id=actor and request_id=p_request order by expires_at desc limit 1;end if;
 else
  select case_id into linked_case from public.recruitment_engagement_requests where actor_kind=kind and actor_id=actor and request_id=p_request and (kind='staff' or case_id=c.id) order by created_at limit 1;
  committed=found;
 end if;
 if committed then return jsonb_build_object('state','committed');end if;
 if kind='applicant' then linked_case=c.id;end if;
 insert into public.recruitment_lifecycle_cancellations(actor_kind,actor_id,domain,request_id,case_id) values(kind,actor,p_domain,p_request,linked_case) on conflict do nothing;
 -- A cancelled proof may no longer be used. Delayed prepares also check the
 -- durable tombstone, so deletion here is neither the sole fence nor a timeout.
 if p_domain='selection' and kind='staff' then delete from public.recruitment_selection_confirmations where actor_id=actor and request_id=p_request;end if;
 return jsonb_build_object('state','cancelled');
end$$;
revoke all on function public.recruitment_lifecycle_cancel(text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_lifecycle_cancel(text,uuid,uuid,text,text) to service_role;

-- Guarded additive wrapping preserves every existing authorisation, feature,
-- revision, assurance, evidence and state-machine check verbatim. No renames or
-- obsolete privileged overloads are introduced. Refuse unsupported definitions.
do $recovery_guards$
declare signature text;source text;definition text;injection text;marker text;at_begin integer;begin
 for signature,injection,marker in select * from (values
 ('public.recruitment_selection_prepare(uuid,uuid,text,jsonb,text,text,text)',
  'perform public.recruitment_lifecycle_request_check(''staff'',p_actor,''selection'',(d->>''requestId'')::uuid);',
  'perform public.recruitment_selection_assert'),
 ('public.recruitment_selection_mutate(uuid,uuid,text,jsonb,text,text,text)',
  'perform public.recruitment_lifecycle_request_check(''staff'',p_actor,''selection'',(d->>''requestId'')::uuid);',
  'fresh_confirmation_required'),
 ('public.recruitment_selection_response(text,jsonb)',
  'perform public.recruitment_lifecycle_request_check(''applicant'',(public.recruitment_case_session(p_hash)).id,''selection'',(d->>''requestId'')::uuid);',
  'interview_unavailable'),
 ('public.recruitment_engagement_mutate(uuid,text,jsonb,text)',
  'perform public.recruitment_lifecycle_request_check(''staff'',p_actor,''engagement'',(d->>''requestId'')::uuid);',
  'hiring_approval_required'),
 ('public.recruitment_engagement_applicant(text,text,jsonb)',
  'if p_action not in (''read'',''recover'') then perform public.recruitment_lifecycle_request_check(''applicant'',(public.recruitment_case_session(p_hash)).id,''engagement'',(d->>''requestId'')::uuid);end if;',
  'offer_unavailable')
 ) x(signature,injection,marker) loop
  if to_regprocedure(signature) is null then raise exception 'recovery_dependency_missing';end if;
  select p.prosrc,pg_get_functiondef(p.oid) into source,definition from pg_proc p where p.oid=to_regprocedure(signature) and p.prosecdef and coalesce(p.proconfig,'{}') @> array['search_path=""'];
  if source is null or position(marker in source)=0 or position('recruitment_lifecycle_request_check' in source)>0 then raise exception 'recovery_dependency_changed';end if;
  at_begin=position('begin' in source);
  if at_begin=0 then raise exception 'recovery_dependency_changed';end if;
  execute replace(definition,source,overlay(source placing 'begin'||chr(10)||' '||injection||chr(10) from at_begin for 5));
 end loop;
end $recovery_guards$;

-- END EXACT SOURCE: supabase/migrations/20261115040000_recruitment_lifecycle_recovery.sql

-- Integrity checks are in the same transaction: any failure rolls back all DDL.
do $m45_postflight$
declare n text;r record;begin
 if exists(select 1 from public.recruitment_settings s where (to_jsonb(s)-array['selection_enabled','onboarding_enabled','activation_enabled']) is distinct from (select value from viva_m45_settings_before))
 then raise exception 'Existing recruitment settings changed unexpectedly';end if;
 if exists(select 1 from public.recruitment_settings where selection_enabled or onboarding_enabled or activation_enabled)
 then raise exception 'New M4/M5 features must remain disabled';end if;
 if exists(select 1 from viva_m45_buckets_before old full join storage.buckets b using(id) where old.value is distinct from to_jsonb(b))
 then raise exception 'Storage buckets changed unexpectedly';end if;
 for n in select name from(values ('recruitment_agreement_acceptances'),
('recruitment_agreement_templates'),
('recruitment_engagement_cases'),
('recruitment_engagement_events'),
('recruitment_engagement_requests'),
('recruitment_lifecycle_cancellations'),
('recruitment_lifecycle_notifications'),
('recruitment_offer_versions'),
('recruitment_offers'),
('recruitment_onboarding_document_links'),
('recruitment_onboarding_tasks'),
('recruitment_selection_assessment_results'),
('recruitment_selection_assessments'),
('recruitment_selection_cases'),
('recruitment_selection_confirmations'),
('recruitment_selection_decisions'),
('recruitment_selection_evaluations'),
('recruitment_selection_events'),
('recruitment_selection_interview_history'),
('recruitment_selection_interviews'),
('recruitment_selection_recommendations'),
('recruitment_selection_requests'),
('recruitment_selection_screenings'),
('recruitment_staff_engagements'),
('recruitment_tutor_session_payments')) expected(name) loop
  if not exists(select 1 from pg_class where oid=to_regclass('public.'||n) and relkind='r' and relrowsecurity) then raise exception 'Missing new RLS table: %',n;end if;
  for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role') loop
   if has_table_privilege(r.rolname,'public.'||n,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.'||n) and a.attnum>0 and not a.attisdropped and has_column_privilege(r.rolname,a.attrelid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) then raise exception 'Unexpected direct table/column access: %.%',r.rolname,n;end if;
  end loop;
 end loop;
 for r in select p.oid,p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'recruitment_%' loop
  if has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('authenticated',r.oid,'EXECUTE') then raise exception 'Unexpected browser RPC privilege: %',r.proname;end if;
  if has_function_privilege('service_role',r.oid,'EXECUTE') and not exists(select 1 from(values ('public.recruitment_applicant_documents(text)'),
('public.recruitment_applicant_logout(text)'),
('public.recruitment_applicant_messages(text)'),
('public.recruitment_applicant_mutate(text,text,jsonb,text,integer)'),
('public.recruitment_applicant_read(text,uuid)'),
('public.recruitment_applicant_reply(text,jsonb,text,integer)'),
('public.recruitment_case_mutate(uuid,text,text,jsonb,text,text,integer,text)'),
('public.recruitment_case_prepare(uuid,text,text,text,jsonb,text,text,text)'),
('public.recruitment_case_recover(uuid,uuid)'),
('public.recruitment_case_stage(uuid,text,uuid,integer,text,jsonb,text)'),
('public.recruitment_cases_read(uuid,uuid,text,text,timestamptz,uuid,text)'),
('public.recruitment_context(uuid)'),
('public.recruitment_deletion_claim(uuid)'),
('public.recruitment_deletion_complete(uuid,uuid,boolean)'),
('public.recruitment_discard_complete(uuid)'),
('public.recruitment_discarded_documents()'),
('public.recruitment_document_access(text,uuid,uuid,text)'),
('public.recruitment_document_mutate(text,text,jsonb,text,integer)'),
('public.recruitment_email_exchange(uuid,text,text,text)'),
('public.recruitment_email_inspect(uuid,text)'),
('public.recruitment_email_request(jsonb,uuid,text,text,integer,jsonb,text,text,text)'),
('public.recruitment_engagement_applicant(text,text,jsonb)'),
('public.recruitment_engagement_mutate(uuid,text,jsonb,text)'),
('public.recruitment_engagement_personnel_list(uuid,text)'),
('public.recruitment_engagement_personnel_read(uuid,uuid,text)'),
('public.recruitment_engagement_read(uuid,uuid,text)'),
('public.recruitment_engagement_recover(uuid,uuid,uuid,text)'),
('public.recruitment_erasure_checked(uuid)'),
('public.recruitment_erasure_manifest()'),
('public.recruitment_form_read(text,text)'),
('public.recruitment_intake_count(text,integer,integer)'),
('public.recruitment_intake_workspace(uuid)'),
('public.recruitment_issue_challenge(uuid,text,text,jsonb,text,text)'),
('public.recruitment_lifecycle_cancel(text,uuid,uuid,text,text)'),
('public.recruitment_lifecycle_summary(uuid,text)'),
('public.recruitment_lifecycle_tick(integer)'),
('public.recruitment_mail_authorize(uuid,uuid)'),
('public.recruitment_mail_claim(uuid)'),
('public.recruitment_mail_complete(uuid,uuid,boolean,text)'),
('public.recruitment_messages_page(text,uuid,uuid,timestamptz,uuid,text)'),
('public.recruitment_mutate(uuid,text,jsonb,text,text,text)'),
('public.recruitment_policy_read()'),
('public.recruitment_privacy_command(text,text,jsonb,text,integer)'),
('public.recruitment_privacy_read(uuid,uuid,text)'),
('public.recruitment_public_intake(uuid[])'),
('public.recruitment_public_vacancies(text,integer,text)'),
('public.recruitment_rate_limit(text,integer)'),
('public.recruitment_reapply(text,jsonb,text,text,integer)'),
('public.recruitment_receipt(text)'),
('public.recruitment_recover_request(uuid,uuid)'),
('public.recruitment_retention_prune()'),
('public.recruitment_retention_schedule()'),
('public.recruitment_scan_claim(uuid)'),
('public.recruitment_scan_complete(uuid,uuid,jsonb)'),
('public.recruitment_scan_promote(uuid,uuid)'),
('public.recruitment_selection_applicant(text)'),
('public.recruitment_selection_applicant_recover(text,uuid)'),
('public.recruitment_selection_mutate(uuid,uuid,text,jsonb,text,text,text)'),
('public.recruitment_selection_prepare(uuid,uuid,text,jsonb,text,text,text)'),
('public.recruitment_selection_read(uuid,uuid,text,text,text,integer,uuid)'),
('public.recruitment_selection_recover(uuid,uuid,text)'),
('public.recruitment_selection_response(text,jsonb)'),
('public.recruitment_selection_summary(uuid,text)'),
('public.recruitment_snapshot(uuid)'),
('public.recruitment_submit(text,jsonb,text,integer)'),
('public.recruitment_vacancy_workspace(uuid,uuid,integer,integer,text,text,text)'),
('public.recruitment_worker_settings()')) expected(signature) where to_regprocedure(expected.signature)::oid=r.oid) then raise exception 'Unexpected service RPC privilege: %',r.proname;end if;
  if exists(select 1 from pg_proc p where p.oid=r.oid and p.prosecdef and not coalesce(p.proconfig,'{}') @> array['search_path=""']) then raise exception 'Unsafe security definer search_path: %',r.proname;end if;
 end loop;
 for n in select signature from(values ('public.recruitment_applicant_documents(text)'),
('public.recruitment_applicant_logout(text)'),
('public.recruitment_applicant_messages(text)'),
('public.recruitment_applicant_mutate(text,text,jsonb,text,integer)'),
('public.recruitment_applicant_read(text,uuid)'),
('public.recruitment_applicant_reply(text,jsonb,text,integer)'),
('public.recruitment_case_mutate(uuid,text,text,jsonb,text,text,integer,text)'),
('public.recruitment_case_prepare(uuid,text,text,text,jsonb,text,text,text)'),
('public.recruitment_case_recover(uuid,uuid)'),
('public.recruitment_case_stage(uuid,text,uuid,integer,text,jsonb,text)'),
('public.recruitment_cases_read(uuid,uuid,text,text,timestamptz,uuid,text)'),
('public.recruitment_context(uuid)'),
('public.recruitment_deletion_claim(uuid)'),
('public.recruitment_deletion_complete(uuid,uuid,boolean)'),
('public.recruitment_discard_complete(uuid)'),
('public.recruitment_discarded_documents()'),
('public.recruitment_document_access(text,uuid,uuid,text)'),
('public.recruitment_document_mutate(text,text,jsonb,text,integer)'),
('public.recruitment_email_exchange(uuid,text,text,text)'),
('public.recruitment_email_inspect(uuid,text)'),
('public.recruitment_email_request(jsonb,uuid,text,text,integer,jsonb,text,text,text)'),
('public.recruitment_engagement_applicant(text,text,jsonb)'),
('public.recruitment_engagement_mutate(uuid,text,jsonb,text)'),
('public.recruitment_engagement_personnel_list(uuid,text)'),
('public.recruitment_engagement_personnel_read(uuid,uuid,text)'),
('public.recruitment_engagement_read(uuid,uuid,text)'),
('public.recruitment_engagement_recover(uuid,uuid,uuid,text)'),
('public.recruitment_erasure_checked(uuid)'),
('public.recruitment_erasure_manifest()'),
('public.recruitment_form_read(text,text)'),
('public.recruitment_intake_count(text,integer,integer)'),
('public.recruitment_intake_workspace(uuid)'),
('public.recruitment_issue_challenge(uuid,text,text,jsonb,text,text)'),
('public.recruitment_lifecycle_cancel(text,uuid,uuid,text,text)'),
('public.recruitment_lifecycle_summary(uuid,text)'),
('public.recruitment_lifecycle_tick(integer)'),
('public.recruitment_mail_authorize(uuid,uuid)'),
('public.recruitment_mail_claim(uuid)'),
('public.recruitment_mail_complete(uuid,uuid,boolean,text)'),
('public.recruitment_messages_page(text,uuid,uuid,timestamptz,uuid,text)'),
('public.recruitment_mutate(uuid,text,jsonb,text,text,text)'),
('public.recruitment_policy_read()'),
('public.recruitment_privacy_command(text,text,jsonb,text,integer)'),
('public.recruitment_privacy_read(uuid,uuid,text)'),
('public.recruitment_public_intake(uuid[])'),
('public.recruitment_public_vacancies(text,integer,text)'),
('public.recruitment_rate_limit(text,integer)'),
('public.recruitment_reapply(text,jsonb,text,text,integer)'),
('public.recruitment_receipt(text)'),
('public.recruitment_recover_request(uuid,uuid)'),
('public.recruitment_retention_prune()'),
('public.recruitment_retention_schedule()'),
('public.recruitment_scan_claim(uuid)'),
('public.recruitment_scan_complete(uuid,uuid,jsonb)'),
('public.recruitment_scan_promote(uuid,uuid)'),
('public.recruitment_selection_applicant(text)'),
('public.recruitment_selection_applicant_recover(text,uuid)'),
('public.recruitment_selection_mutate(uuid,uuid,text,jsonb,text,text,text)'),
('public.recruitment_selection_prepare(uuid,uuid,text,jsonb,text,text,text)'),
('public.recruitment_selection_read(uuid,uuid,text,text,text,integer,uuid)'),
('public.recruitment_selection_recover(uuid,uuid,text)'),
('public.recruitment_selection_response(text,jsonb)'),
('public.recruitment_selection_summary(uuid,text)'),
('public.recruitment_snapshot(uuid)'),
('public.recruitment_submit(text,jsonb,text,integer)'),
('public.recruitment_vacancy_workspace(uuid,uuid,integer,integer,text,text,text)'),
('public.recruitment_worker_settings()')) expected(signature) loop
  if to_regprocedure(n) is null or not has_function_privilege('service_role',to_regprocedure(n),'EXECUTE') then raise exception 'Missing intended service RPC: %',n;end if;
 end loop;
 insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,details)
 values('installation_m4_m5',session_user,current_setting('viva_m45.operator'),current_setting('viva_m45.approval'),
 'Approved incremental M4/M5 installation; existing controls preserved and new features disabled',
 jsonb_build_object('sourceSetSha256','6fd2750319dcb4af826b5ea98c6a5231f55baf1fcc53fefac38fa1c0c1477cd6','projectReference',current_setting('viva_m45.project'),'sourceMigrations','[{"order":1,"path":"supabase/migrations/20261115010000_recruitment_selection.sql","bytes":45171,"sha256":"e50393e253cd245b9ee736ad3f8aad1da306370754f0de43d78c903a5c156e68"},{"order":2,"path":"supabase/migrations/20261115020000_recruitment_engagement.sql","bytes":58922,"sha256":"6cfa200dad4fcdf84c9dbcea0fb3b9dc8c83bc6b94c3979c3d19e3c0a2f0beb6"},{"order":3,"path":"supabase/migrations/20261115025000_recruitment_onboarding_documents.sql","bytes":20551,"sha256":"815edb89a7ae80c3e0a2c8749fd3b240887f5f561886e5886da1f19b9ec61343"},{"order":4,"path":"supabase/migrations/20261115030000_recruitment_lifecycle_workers.sql","bytes":18633,"sha256":"c7d6462d7f319f0962b4ad486de583f0b17a981a5b21997594d83345557d9e89"},{"order":5,"path":"supabase/migrations/20261115040000_recruitment_lifecycle_recovery.sql","bytes":8006,"sha256":"b30eeb2171342d8a37737a582976a9c63c0d6a1cab8962f5001e0df18b6d85fe"}]'::jsonb));
end $m45_postflight$;
notify pgrst,'reload schema';
commit;
