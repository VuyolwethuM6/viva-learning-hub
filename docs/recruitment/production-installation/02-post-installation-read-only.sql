-- READ ONLY. Run SELECT blocks separately in SQL Editor. No business RPCs are invoked.
-- Result 1: expected table/RLS inventory.
with expected(name) as(values ('recruitment_settings'),
('recruitment_staff'),
('recruitment_scopes'),
('recruitment_staff_scopes'),
('recruitment_requests'),
('recruitment_events'),
('recruitment_auth_limits'),
('recruitment_reauth_challenges'),
('recruitment_access_approvals'),
('recruitment_operational_events'),
('recruitment_tutor_bindings'),
('recruitment_tutor_rebind_authorizations'),
('recruitment_vacancies'),
('recruitment_vacancy_versions'),
('recruitment_vacancy_approvals'),
('recruitment_vacancy_publications'),
('recruitment_vacancy_assignments'),
('recruitment_intake_forms'),
('recruitment_intake_form_bindings'),
('recruitment_cases'),
('recruitment_case_contacts'),
('recruitment_case_payloads'),
('recruitment_case_assignments'),
('recruitment_case_conflicts'),
('recruitment_consent_events'),
('recruitment_case_audit'),
('recruitment_privacy_holds'),
('recruitment_case_requests'),
('recruitment_staff_change_buffers'),
('recruitment_case_challenges'),
('recruitment_privacy_notices'),
('recruitment_intake_limits'),
('recruitment_email_challenges'),
('recruitment_applicant_sessions'),
('recruitment_email_outbox'),
('recruitment_case_documents'),
('recruitment_document_scans'),
('recruitment_submissions'),
('recruitment_case_notes'),
('recruitment_deletion_jobs'),
('recruitment_retention_runs'),
('recruitment_erasure_evidence'))
select e.name,c.oid is not null present,c.relkind,c.relrowsecurity,pg_get_userbyid(c.relowner) owner from expected e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name order by e.name;

-- Result 2: controls; all booleans below must remain false after installation.
select staff_console_enabled,access_guards_enabled,access_guards_mandatory,owner_aal2_required,public_vacancies_enabled,vacancy_intake_enabled,talent_pool_intake_enabled,applicant_email_enabled,document_uploads_enabled,case_processing_enabled,case_evidence_days,intake_policy_approved_at,backup_retention_days,scanner_attested_at from public.recruitment_settings;

-- Result 3: must be a validated CHECK prohibiting all five intake flags.
select conname,convalidated,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.recruitment_settings'::regclass and conname='recruitment_m31_intake_interlock';

-- Result 4: both new buckets private, four existing buckets still present.
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id;

-- Result 5: recruitment restrictive policy; compare all legacy policies with preflight.
select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' order by policyname;

-- Result 6: zero rows required.
select c.relname,r.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r where n.nspname='public' and c.relname~'^recruitment_' and c.relkind in('r','p') and r.rolname in('anon','authenticated','service_role') and (has_table_privilege(r.rolname,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and has_column_privilege(r.rolname,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')));

-- Result 7: actual function EXECUTE permissions; service_allowed must equal expected_service.
with expected(signature) as(values ('public.recruitment_applicant_documents(text)'),
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
('public.recruitment_erasure_checked(uuid)'),
('public.recruitment_erasure_manifest()'),
('public.recruitment_form_read(text,text)'),
('public.recruitment_intake_count(text,integer,integer)'),
('public.recruitment_intake_workspace(uuid)'),
('public.recruitment_issue_challenge(uuid,text,text,jsonb,text,text)'),
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
('public.recruitment_snapshot(uuid)'),
('public.recruitment_submit(text,jsonb,text,integer)'),
('public.recruitment_vacancy_workspace(uuid,uuid,integer,integer,text,text,text)'),
('public.recruitment_worker_settings()'))
select p.oid::regprocedure::text signature,p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_allowed,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_allowed,has_function_privilege('service_role',p.oid,'EXECUTE') service_allowed,exists(select 1 from expected e where to_regprocedure(e.signature)::oid=p.oid) expected_service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname~'^recruitment_' and p.prokind='f' order by signature;

-- Result 8: retired signatures must all be absent.
select signature,to_regprocedure(signature) installed from(values ('public.recruitment_bootstrap(uuid)'),
('public.recruitment_issue_challenge(uuid,text,text,jsonb,text)'),
('public.recruitment_mutate(uuid,text,jsonb,text,text)')) x(signature);

-- Result 9: new triggers only; compare other triggers with preflight.
select n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and t.tgname~'^recruitment_' order by n.nspname,c.relname,t.tgname;

-- Result 10: protected installation evidence, no credentials or applicant rows.
select id,action,database_actor,operator_reference,approval_reference,created_at,details->>'sourceCommit' source_commit,details->>'sourceSetSha256' source_set_sha256 from public.recruitment_operational_events where action='installation_m1_m3' order by created_at desc;

-- Result 11: sequence privileges; all access booleans must be false.
select r.rolname,has_sequence_privilege(r.oid,'public.recruitment_vacancy_reference_seq','USAGE,SELECT,UPDATE') any_direct_access from pg_roles r where r.rolname in('anon','authenticated','service_role');

-- Result 12: identity backfill counts only; no tutor identity was changed.
select count(*) binding_records,count(*) filter(where history_unresolved) unresolved_history_records from public.recruitment_tutor_bindings;
