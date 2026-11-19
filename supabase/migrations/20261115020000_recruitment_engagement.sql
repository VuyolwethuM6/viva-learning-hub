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
