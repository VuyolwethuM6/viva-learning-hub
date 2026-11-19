-- READ ONLY. Run on target only after separately approving read access.
-- No installation or business RPCs. Save results securely for comparison.
select current_database(),version();
select id,action,created_at from public.recruitment_operational_events where action='installation_m1_m3' order by created_at desc;
select c.relname,c.relrowsecurity from pg_class c where c.relnamespace='public'::regnamespace and c.relname like 'recruitment_%' and c.relkind='r' order by c.relname;
select p.oid::regprocedure,p.prosecdef,p.proconfig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('recruitment_guard_case','recruitment_case_session','recruitment_retention_due','recruitment_case_staff_allowed','recruitment_document_mutate','recruitment_scan_claim','recruitment_scan_promote','recruitment_scan_complete','recruitment_mail_authorize','recruitment_case_erase') order by 1;
select count(*) tutor_count from public.teaching_tutors;
select count(*) binding_count,count(*) filter(where history_unresolved) unresolved from public.recruitment_tutor_bindings;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id;
select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' order by policyname;
select staff_console_enabled,access_guards_enabled,access_guards_mandatory,owner_aal2_required,vacancy_intake_enabled,talent_pool_intake_enabled,case_processing_enabled,document_uploads_enabled,applicant_email_enabled from public.recruitment_settings;
select count(*) independently_controlled_owners_to_verify from public.recruitment_staff s join auth.users u on u.id=s.user_id where s.enabled and s.role='owner' and u.email_confirmed_at is not null;
-- Count is not proof of independent custody, real MFA, recovery or service acceptance.
-- Accounting read guards narrowed for newly recruited administration-only users.
select p.oid::regprocedure,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('accounting_snapshot','accounting_document_data','accounting_export_rows') order by 1;
