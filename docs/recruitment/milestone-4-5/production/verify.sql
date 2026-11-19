-- READ ONLY after separately approved installation; never enables a feature.
select selection_enabled,onboarding_enabled,activation_enabled from public.recruitment_settings;
-- Immediately after install all three new flags must be false; old flags unchanged.
select c.relname,c.relrowsecurity from pg_class c where c.relnamespace='public'::regnamespace and c.relname ~ '^recruitment_(selection|engagement|offer|agreement|onboarding|staff_engagement|lifecycle)' and c.relkind='r' order by c.relname;
-- Zero rows required: browser or direct service table access.
select c.relname,r.rolname from pg_class c cross join pg_roles r where c.relnamespace='public'::regnamespace and c.relname like 'recruitment_%' and c.relkind='r' and r.rolname in('anon','authenticated','service_role') and has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
-- Zero rows required: browser RPC execution or unsafe search_path.
select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'recruitment_%' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or (p.prosecdef and not coalesce(p.proconfig,'{}') @> array['search_path=""']));
select p.oid::regprocedure,has_function_privilege('service_role',p.oid,'EXECUTE') service_execute from pg_proc p where p.pronamespace='public'::regnamespace and p.proname ~ '^recruitment_(selection|engagement|onboarding|lifecycle)' order by 1;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id;
select count(*) binding_count,count(*) filter(where history_unresolved) unresolved from public.recruitment_tutor_bindings;
-- Compare prior bucket, trigger, academic/accounting and table inventories with preflight.
