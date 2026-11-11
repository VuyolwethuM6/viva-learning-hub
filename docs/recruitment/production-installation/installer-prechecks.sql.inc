-- Preparation is not execution approval. Replace these NON-SECRET references
-- only after this exact package and the actual target/parameter bindings are approved.
-- They are transaction-local and recorded in protected installation evidence.
do $install_preflight$
declare
 operator_ref text='__REQUIRED_OPERATOR_REFERENCE__';
 approval_ref text='__REQUIRED_INSTALL_APPROVAL__';
 project_ref text='__REQUIRED_PROJECT_REFERENCE__';
 r record; actual oid; owner_id oid; policy_config text; policy_tables jsonb;
begin
 if operator_ref like '__REQUIRED_%' or approval_ref like '__REQUIRED_%' or project_ref like '__REQUIRED_%'
 or length(btrim(operator_ref))<3 or length(btrim(approval_ref))<3 or length(btrim(project_ref))<3 then
  raise exception 'STOP: exact package approval, reviewed target and real operator/approval/project references are required';end if;
 if current_setting('server_version_num')::integer not between 170000 and 179999 then raise exception 'Target PostgreSQL major differs from reviewed PostgreSQL 17';end if;
 perform set_config('viva_install.operator',operator_ref,true);
 perform set_config('viva_install.approval',approval_ref,true);
 perform set_config('viva_install.project_reference',project_ref,true);
 if not exists(select 1 from pg_extension where extname='pgcrypto') then raise exception 'Expected existing pgcrypto extension';end if;
 if to_regprocedure('pg_catalog.gen_random_uuid()') is null then raise exception 'Missing built-in UUID function';end if;
 for r in select name from(values('anon'),('authenticated'),('service_role'))v(name) loop
  if not exists(select 1 from pg_roles where rolname=r.name) then raise exception 'Missing Supabase API role: %',r.name;end if;
 end loop;
 if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls) then raise exception 'Unexpected service role RLS configuration; inspect before install';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relname~'^recruitment_' and n.nspname !~ '^pg_' and n.nspname<>'information_schema')
 or exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname~'^_?recruitment_' and n.nspname !~ '^pg_' and n.nspname<>'information_schema')
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (p.proname~'^recruitment_' and n.nspname !~ '^pg_' and n.nspname<>'information_schema') or(n.nspname='public' and p.proname like 'recruitment_%')) then
  raise exception 'Not a fresh recruitment namespace: stop and reconcile; do not delete or overwrite existing objects';end if;
 if exists(select 1 from pg_trigger where not tgisinternal and tgname~'^recruitment_') or exists(select 1 from pg_policy where polname~'^recruitment_') then raise exception 'Recruitment-named trigger or policy conflict requires review';end if;
 for r in select * from(values
 ('auth','users','id','uuid'),('auth','users','email','textlike'),('auth','users','email_confirmed_at','timestamptz'),
 ('public','admin_users','user_id','uuid'),('public','admin_users','enabled','boolean'),('public','admin_users','finance_role','textlike'),
 ('public','teaching_tutors','id','uuid'),('public','teaching_tutors','user_id','uuid'),('public','teaching_tutors','enabled','boolean'),('public','teaching_tutors','email','textlike'),('public','teaching_tutors','last_signed_in_at','timestamptz'),
 ('public','teaching_events','id','uuid'),('public','teaching_events','action','textlike'),('public','teaching_events','details','jsonb'),('public','teaching_events','created_at','timestamptz'),
 ('storage','objects','bucket_id','textlike'),('storage','objects','name','textlike'),
 ('storage','buckets','id','textlike'),('storage','buckets','name','textlike'),('storage','buckets','public','boolean'),('storage','buckets','file_size_limit','bigint'),('storage','buckets','allowed_mime_types','text[]')
 )v(schema_name,table_name,column_name,type_name) loop
  select a.atttypid into actual from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=r.schema_name and c.relname=r.table_name and c.relkind in('r','p') and a.attname=r.column_name and a.attnum>0 and not a.attisdropped;
  if actual is null or (r.type_name='textlike' and actual not in('text'::regtype,'varchar'::regtype)) or (r.type_name<>'textlike' and actual<>to_regtype(r.type_name)) then raise exception 'Missing/incompatible dependency: %.%.% expected %; do not alter legacy columns to bypass',r.schema_name,r.table_name,r.column_name,r.type_name;end if;
 end loop;
 for r in select * from(values('auth','users'),('public','teaching_tutors'))v(schema_name,table_name) loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attname='id' join pg_index i on i.indrelid=c.oid where n.nspname=r.schema_name and c.relname=r.table_name and i.indisunique and i.indisvalid and i.indimmediate and i.indpred is null and i.indexprs is null and i.indnkeyatts=1 and i.indkey[0]=a.attnum) then raise exception 'Expected an immediate unique ID for %.%',r.schema_name,r.table_name;end if;
 end loop;
 -- CREATE TRIGGER needs the TRIGGER privilege, not table ownership. Existing
 -- recruitment trigger names were already required absent, so no legacy trigger is dropped.
 for r in select * from(values('auth','users'),('public','admin_users'),('public','teaching_tutors'))v(schema_name,table_name) loop
  if not has_table_privilege(current_user,format('%I.%I',r.schema_name,r.table_name),'TRIGGER') then raise exception 'Missing TRIGGER privilege on %.%; do not change legacy ownership',r.schema_name,r.table_name;end if;
 end loop;
 if not has_table_privilege(current_user,'auth.users','REFERENCES') then raise exception 'Missing Auth FK reference privilege';end if;
 if not has_schema_privilege(current_user,'auth','USAGE') or not has_schema_privilege(current_user,'storage','USAGE') then raise exception 'Missing existing Auth/Storage schema USAGE; reconcile grants rather than changing managed ownership';end if;
 if not has_table_privilege(current_user,'storage.buckets','INSERT') then raise exception 'Missing permission to insert the two new private bucket records';end if;
 -- CREATE POLICY is owner-only in standard PostgreSQL. Supabase can explicitly
 -- delegate this narrow operation through its existing registered Supautils hook.
 -- This script never changes owner, role memberships, ACLs or Supautils configuration.
 select relowner into owner_id from pg_class where oid='storage.objects'::regclass;
 if not pg_has_role(current_user,owner_id,'USAGE') and not exists(select 1 from pg_roles where rolname=current_user and rolsuper) then
  if not exists(select 1 from pg_settings where name='supautils.policy_grants') then raise exception 'Unconfirmed Storage policy authority: no registered delegation; obtain supported platform review';end if;
  policy_config=current_setting('supautils.policy_grants',true);
  if nullif(policy_config,'') is null then raise exception 'Storage policy delegation is not configured';end if;
  policy_tables=(policy_config::jsonb)->current_user;
  if not coalesce(policy_tables @> '["storage.objects"]'::jsonb,false) then raise exception 'Current role lacks explicit delegated Storage object-policy authority; stop rather than changing owners';end if;
 end if;
 if not has_schema_privilege(current_user,'public','CREATE') then raise exception 'Current role cannot create recruitment objects';end if;
 if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then raise exception 'Storage RLS must already be enabled; this installer will not change legacy RLS settings';end if;
 if (select count(*) from storage.buckets)<>4 then raise exception 'Bucket count changed from reviewed four-bucket baseline; re-inventory';end if;
 if exists(select 1 from storage.buckets where id in('recruitment-quarantine','recruitment-documents')) then raise exception 'New bucket names already exist; inspect rather than overwrite';end if;
end $install_preflight$;
