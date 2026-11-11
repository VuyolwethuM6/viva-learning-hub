-- COMPLETED STRUCTURAL INVENTORY. Retained for drift checks; no data/credentials.
-- Existing reported policy/index/trigger results need not be repeated.
with required(schema_name,table_name,column_name,expected_type) as(values
 ('auth','users','id','uuid'),('auth','users','email','textlike'),('auth','users','email_confirmed_at','timestamptz'),
 ('public','admin_users','user_id','uuid'),('public','admin_users','enabled','boolean'),('public','admin_users','finance_role','textlike'),
 ('public','teaching_tutors','id','uuid'),('public','teaching_tutors','user_id','uuid'),('public','teaching_tutors','enabled','boolean'),('public','teaching_tutors','email','textlike'),('public','teaching_tutors','last_signed_in_at','timestamptz'),
 ('public','teaching_events','id','uuid'),('public','teaching_events','action','textlike'),('public','teaching_events','details','jsonb'),('public','teaching_events','created_at','timestamptz'),
 ('storage','objects','bucket_id','textlike'),('storage','objects','name','textlike'),
 ('storage','buckets','id','textlike'),('storage','buckets','name','textlike'),('storage','buckets','public','boolean'),('storage','buckets','file_size_limit','bigint'),('storage','buckets','allowed_mime_types','text[]')
),relations as(
 select c.*,n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where(n.nspname='public' and c.relname in('admin_users','teaching_tutors','teaching_events'))
 or(n.nspname='auth' and c.relname='users') or(n.nspname='storage' and c.relname in('objects','buckets'))
)
select jsonb_build_object(
 'current_role',current_user,
 'required_columns',(
  select jsonb_agg(jsonb_build_object('schema',r.schema_name,'table',r.table_name,'column',r.column_name,'expected',r.expected_type,'actual',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'compatible',coalesce(case when r.expected_type='textlike' then a.atttypid in('text'::regtype,'varchar'::regtype) else a.atttypid=to_regtype(r.expected_type) end,false)) order by r.schema_name,r.table_name,r.column_name)
  from required r left join relations c on c.nspname=r.schema_name and c.relname=r.table_name and c.relkind in('r','p') left join pg_attribute a on a.attrelid=c.oid and a.attname=r.column_name and a.attnum>0 and not a.attisdropped
 ),
 'relation_authority',(
  select jsonb_agg(jsonb_build_object('schema',c.nspname,'table',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls_enabled',c.relrowsecurity,'inherits_owner',pg_has_role(current_user,c.relowner,'USAGE'),'current_role_select',has_table_privilege(current_user,c.oid,'SELECT'),'current_role_insert',has_table_privilege(current_user,c.oid,'INSERT'),'acl',c.relacl::text) order by c.nspname,c.relname) from relations c
 ),
 'admin_role_checks',(select coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid))),'[]'::jsonb) from pg_constraint k join relations c on c.oid=k.conrelid where c.nspname='public' and c.relname='admin_users' and k.contype='c'),
 'public_schema_create',has_schema_privilege(current_user,'public','CREATE'),
 'roles',(
  select jsonb_agg(jsonb_build_object('role',r.rolname,'superuser',r.rolsuper,'inherits',r.rolinherit,'bypasses_rls',r.rolbypassrls) order by r.rolname) from pg_roles r where r.rolname in('postgres','anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin')
 ),
 'role_memberships',(
  select jsonb_agg(jsonb_build_object('member',pg_get_userbyid(m.member),'granted_role',pg_get_userbyid(m.roleid),'admin_option',m.admin_option) order by m.member,m.roleid) from pg_auth_members m
 ),
 'defaults_for_creating_role',(
  select coalesce(jsonb_agg(jsonb_build_object('schema',coalesce(n.nspname,'[GLOBAL]'),'object_type',d.defaclobjtype,'acl',d.defaclacl::text)),'[]'::jsonb) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole=(select oid from pg_roles where rolname=current_user) and(d.defaclnamespace=0 or n.nspname in('public','auth','storage'))
 )
) as remaining_compatibility_evidence;
