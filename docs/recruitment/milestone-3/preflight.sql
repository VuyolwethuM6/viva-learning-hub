-- READ ONLY: review the relevant approved target before requesting execution.
select current_database(),session_user,current_setting('server_version');
select n.nspname,c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) owner
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='public' and c.relname in ('recruitment_settings','recruitment_staff','recruitment_scopes','recruitment_vacancies','recruitment_vacancy_versions','recruitment_intake_forms','recruitment_cases','recruitment_case_payloads'))
 or(n.nspname='storage' and c.relname in ('objects','buckets')) order by 1,2;
select conname,pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.recruitment_settings'::regclass and conname like 'recruitment%';
select vacancy_intake_enabled,talent_pool_intake_enabled,applicant_email_enabled,document_uploads_enabled,case_processing_enabled,
 case_evidence_days,intake_policy_approval_ref,intake_policy_approved_at
 from public.recruitment_settings where singleton;
select proname,oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
 ('recruitment_assert','recruitment_require_assurance','recruitment_mutate','recruitment_authorize','recruitment_case_staff_allowed','recruitment_guard_case_evidence','recruitment_public_vacancies');
select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects';
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('recruitment-quarantine','recruitment-documents');
select count(*) foundation_case_count from public.recruitment_cases;
select count(*) foundation_payload_count from public.recruitment_case_payloads;
select count(*) learner_application_count from public.applications;
select count(*) tutor_count from public.teaching_tutors;
select count(*) ledger_journal_count from public.accounting_journals;
-- Confirm corrected M3.1 checksums/history separately. Do not print any applicant rows,
-- Auth email values, tokens, environment secrets or stored files.
-- Confirm operator ownership permits the new restrictive Storage policy. Existing
-- incorrectly configured same-named buckets are not overwritten: intake fails closed.
-- All four new migrations are one dependency unit; use the reviewed transaction bundle.
