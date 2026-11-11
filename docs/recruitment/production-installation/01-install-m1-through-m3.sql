-- FINAL EXECUTION-REVIEW PACKAGE. COMPATIBILITY RECONCILED; DO NOT EXECUTE WITHOUT EXACT-SCRIPT APPROVAL.
-- SQL EDITOR ONLY; FRESH RECRUITMENT INSTALL, NOT A FULL PLATFORM SCHEMA RESET.
-- Sources pinned to a1444b7596cfa062801c6a78f5037527c0bde09c. Original migration bytes are copied verbatim.
-- Execute the WHOLE transaction; do not run historical intermediate migrations individually.
begin;
set local lock_timeout='5s';
set local statement_timeout='180s';
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


-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261109010000_recruitment_foundations.sql
-- SHA256 8fd3eb9840e655e0af7db9efcb13dd131f343f3ae4a32c19bd891d3bf90a6eb9
-- Milestone 1 only. No applicants, uploads, hiring or activation operations.
create table if not exists public.recruitment_settings (
 singleton boolean primary key default true check(singleton),
 revision integer not null default 0 check(revision>=0),
 bootstrapped_at timestamptz,
 staff_console_enabled boolean not null default false,
 access_guards_enabled boolean not null default false,
 privacy_policy_version text not null default '' check(length(privacy_policy_version)<=120),
 draft_days integer not null default 14 check(draft_days=14),
 unsuccessful_months integer not null default 6 check(unsuccessful_months=6),
 talent_pool_months integer not null default 12 check(talent_pool_months=12),
 check(not staff_console_enabled or access_guards_enabled)
);
insert into public.recruitment_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.recruitment_staff (
 user_id uuid primary key references auth.users(id),
 role text not null check(role in ('owner','manager','officer')),
 enabled boolean not null default false,
 revision integer not null default 0 check(revision>=0),
 granted_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create table if not exists public.recruitment_scopes (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('vacancy','talent_pool')),
 label text not null check(length(trim(label)) between 2 and 120),
 created_at timestamptz not null default now()
);
create unique index if not exists recruitment_one_talent_pool on public.recruitment_scopes(kind) where kind='talent_pool';
create table if not exists public.recruitment_staff_scopes (
 user_id uuid not null references public.recruitment_staff(user_id),
 scope_id uuid not null references public.recruitment_scopes(id),
 enabled boolean not null default false,
 revision integer not null default 0 check(revision>=0),
 granted_by uuid not null references auth.users(id),
 primary key(user_id,scope_id)
);
create table if not exists public.recruitment_requests (
 id uuid primary key,
 actor_id uuid not null references auth.users(id),
 operation text not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.recruitment_events (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id),
 action text not null,
 target_id uuid,
 request_id uuid,
 details jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists recruitment_events_recent on public.recruitment_events(created_at desc,id);
create table if not exists public.recruitment_auth_limits (
 key_hash text primary key check(key_hash ~ '^[0-9a-f]{64}$'),
 started_at timestamptz not null default now(),
 attempts integer not null default 1
);
create index if not exists recruitment_auth_limits_expiry on public.recruitment_auth_limits(started_at);
create table if not exists public.recruitment_reauth_challenges (
 secret_hash text primary key check(secret_hash ~ '^[0-9a-f]{64}$'),
 actor_id uuid not null references auth.users(id),
 session_hash text not null check(session_hash ~ '^[0-9a-f]{64}$'),
 operation text not null,
 payload jsonb not null,
 expires_at timestamptz not null,
 consumed_at timestamptz
);
create index if not exists recruitment_challenges_expiry on public.recruitment_reauth_challenges(expires_at);
-- Reserved, non-callable activation evidence. No approval/consumption RPC ships in M1.
create table if not exists public.recruitment_access_approvals (
 id uuid primary key default gen_random_uuid(),
 target_user_id uuid not null references auth.users(id),
 owner_id uuid not null references auth.users(id),
 destination text not null check(destination in ('teaching','administration')),
 prerequisite_reference uuid not null,
 expires_at timestamptz not null,
 consumed_at timestamptz,
 check(target_user_id<>owner_id)
);
create or replace function public.recruitment_immutable() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Recruitment history is append-only.';end$$;
do $$declare t text;begin
 foreach t in array array['recruitment_settings','recruitment_staff','recruitment_scopes','recruitment_staff_scopes','recruitment_requests','recruitment_events','recruitment_auth_limits','recruitment_reauth_challenges','recruitment_access_approvals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach t in array array['recruitment_requests','recruitment_events','recruitment_access_approvals'] loop
  execute format('drop trigger if exists recruitment_immutable on public.%I',t);
  execute format('create trigger recruitment_immutable before update or delete on public.%I for each row execute function public.recruitment_immutable()',t);
 end loop;
end$$;
revoke all on function public.recruitment_immutable() from public,anon,authenticated,service_role;

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261109010000_recruitment_foundations.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261109020000_recruitment_security_operations.sql
-- SHA256 3875c5d0d5fffeda8e4ea28ca1eddb77510f8692c4853030d4a91af94ea284b1
create or replace function public.recruitment_assert(p_actor uuid,p_owner boolean default false) returns public.recruitment_staff
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;begin
 select r.* into s from public.recruitment_staff r join auth.users u on u.id=r.user_id
 where r.user_id=p_actor and r.enabled and u.email_confirmed_at is not null;
 if s.user_id is null or (p_owner and s.role<>'owner') then raise exception 'Recruitment permission is required.';end if;
 if s.role<>'owner' and not exists(select 1 from public.recruitment_settings where singleton and staff_console_enabled) then raise exception 'The recruitment staff console is disabled.';end if;
 return s;
end$$;
-- Out-of-band bootstrap only. Deliberately not granted to service_role or exposed by HTTP.
create or replace function public.recruitment_bootstrap(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.recruitment_settings where singleton for update;
 if exists(select 1 from public.recruitment_settings where bootstrapped_at is not null) or exists(select 1 from public.recruitment_staff) then raise exception 'Recruitment was already bootstrapped.';end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Choose an existing verified Auth identity.';end if;
 insert into public.recruitment_staff(user_id,role,enabled,granted_by) values(p_user,'owner',true,p_user);
 update public.recruitment_settings set bootstrapped_at=now(),revision=revision+1 where singleton;
 insert into public.recruitment_events(actor_id,action,target_id,details) values(p_user,'owner_bootstrap',p_user,jsonb_build_object('method','authorized database operator'));
end$$;
create or replace function public.recruitment_rate_limit(p_hash text,p_limit integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare a integer;begin
 if p_hash !~ '^[0-9a-f]{64}$' or p_limit not between 1 and 30 then raise exception 'Invalid rate-limit request.';end if;
 delete from public.recruitment_auth_limits where started_at<now()-interval '1 day';
 insert into public.recruitment_auth_limits(key_hash) values(p_hash)
 on conflict(key_hash) do update set
 attempts=case when recruitment_auth_limits.started_at<now()-interval '15 minutes' then 1 else recruitment_auth_limits.attempts+1 end,
 started_at=case when recruitment_auth_limits.started_at<now()-interval '15 minutes' then now() else recruitment_auth_limits.started_at end
 returning attempts into a;
 return a<=p_limit;
end$$;
create or replace function public.recruitment_context(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;begin
 s=public.recruitment_assert(p_actor);
 return jsonb_build_object('id',s.user_id,'role',s.role,'revision',s.revision,'email',(select email from auth.users where id=p_actor));
end$$;
create or replace function public.recruitment_authorize(p_actor uuid,p_operation text,p_data jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff; target uuid; scope uuid; allowed text[];begin
 s=public.recruitment_assert(p_actor);
 if p_operation not in ('staff_grant','scope_create','scope_grant','settings') then raise exception 'This recruitment operation has not been released.';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or nullif(p_data->>'requestId','') is null then raise exception 'Choose a stable request and valid details.';end if;
 allowed=case p_operation when 'staff_grant' then array['requestId','userId','role','enabled','expectedRevision'] when 'scope_grant' then array['requestId','userId','scopeId','enabled','expectedRevision'] when 'scope_create' then array['requestId','kind','label'] else array['requestId','expectedRevision','staffConsoleEnabled','accessGuardsEnabled','privacyPolicyVersion'] end;
 if not (p_data ?& allowed) or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(allowed))) then raise exception 'Only the released security fields are accepted.';end if;
 if p_operation in ('staff_grant','scope_grant') and (jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or (p_data->>'expectedRevision')::integer < -1) then raise exception 'Choose a state and expected revision.';end if;
 if p_operation='settings' and (jsonb_typeof(p_data->'staffConsoleEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'accessGuardsEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or jsonb_typeof(p_data->'privacyPolicyVersion') is distinct from 'string') then raise exception 'Choose valid rollout controls.';end if;
 if p_operation='settings' and (p_data->>'staffConsoleEnabled')::boolean and not (p_data->>'accessGuardsEnabled')::boolean then raise exception 'Enable the access safeguards before enabling the staff console.';end if;
 if p_operation<>'scope_grant' then perform public.recruitment_assert(p_actor,true);
 else
  target=(p_data->>'userId')::uuid;scope=(p_data->>'scopeId')::uuid;
  if not exists(select 1 from public.recruitment_staff where user_id=target) or not exists(select 1 from public.recruitment_scopes where id=scope) then raise exception 'Choose an existing recruitment staff identity and scope.';end if;
  if s.role<>'owner' and (s.role<>'manager' or not exists(select 1 from public.recruitment_staff_scopes where user_id=p_actor and scope_id=scope and enabled) or not exists(select 1 from public.recruitment_staff where user_id=target and role='officer' and enabled)) then raise exception 'Scope delegation is not permitted.';end if;
 end if;
 if p_operation in ('staff_grant','scope_grant') and (p_data->>'userId')::uuid=p_actor then raise exception 'You cannot change your own recruitment grants.';end if;
end$$;
create or replace function public.recruitment_issue_challenge(p_actor uuid,p_session_hash text,p_operation text,p_data jsonb,p_secret_hash text) returns void
language plpgsql security definer set search_path='' as $$begin
 perform public.recruitment_authorize(p_actor,p_operation,p_data);
 if p_session_hash !~ '^[0-9a-f]{64}$' or p_secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid verification proof.';end if;
 delete from public.recruitment_reauth_challenges where expires_at<now()-interval '1 day';
 insert into public.recruitment_reauth_challenges(secret_hash,actor_id,session_hash,operation,payload,expires_at) values(p_secret_hash,p_actor,p_session_hash,p_operation,p_data,now()+interval '5 minutes');
end$$;
create or replace function public.recruitment_mutate(p_actor uuid,p_operation text,p_data jsonb,p_session_hash text,p_proof_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.recruitment_settings; prior public.recruitment_requests; staff public.recruitment_staff;
 rid uuid=(p_data->>'requestId')::uuid; target uuid; scope uuid; rev integer; result jsonb; before_row jsonb;
begin
 select * into cfg from public.recruitment_settings where singleton for update;
 perform public.recruitment_authorize(p_actor,p_operation,p_data);
 if rid is null then raise exception 'A stable request ID is required.';end if;
 select * into prior from public.recruitment_requests where id=rid;
 if prior.id is not null then
  if prior.actor_id<>p_actor or prior.operation<>p_operation or prior.payload<>p_data then raise exception 'Request ID conflicts with an earlier operation.';end if;
  return prior.result;
 end if;
 update public.recruitment_reauth_challenges set consumed_at=now()
 where secret_hash=p_proof_hash and actor_id=p_actor and session_hash=p_session_hash and operation=p_operation and payload=p_data and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'Fresh action-specific authentication is required.';end if;
 if p_operation='staff_grant' then
  target=(p_data->>'userId')::uuid;
  if not exists(select 1 from auth.users where id=target and email_confirmed_at is not null) then raise exception 'Choose an existing verified Auth identity.';end if;
  select * into staff from public.recruitment_staff where user_id=target;
  if coalesce(staff.revision,-1)<>(p_data->>'expectedRevision')::integer then raise exception 'Staff permissions changed. Refresh and review again.';end if;
  if staff.role='owner' and staff.enabled and (p_data->>'role'<>'owner' or not (p_data->>'enabled')::boolean) and (select count(*) from public.recruitment_staff where role='owner' and enabled)<=1 then raise exception 'Keep at least one enabled recruitment owner.';end if;
  before_row=jsonb_build_object('role',staff.role,'enabled',staff.enabled,'revision',staff.revision);
  insert into public.recruitment_staff(user_id,role,enabled,granted_by) values(target,p_data->>'role',(p_data->>'enabled')::boolean,p_actor)
  on conflict(user_id) do update set role=excluded.role,enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_staff.revision+1,updated_at=now();
  result=jsonb_build_object('userId',target);
 elsif p_operation='scope_create' then
  if p_data->>'kind'='talent_pool' and exists(select 1 from public.recruitment_scopes where kind='talent_pool') then raise exception 'The talent-pool scope already exists. Choose the existing scope.';end if;
  insert into public.recruitment_scopes(kind,label) values(p_data->>'kind',trim(p_data->>'label')) returning id into scope;
  result=jsonb_build_object('scopeId',scope);
 elsif p_operation='scope_grant' then
  target=(p_data->>'userId')::uuid;scope=(p_data->>'scopeId')::uuid;
  select revision,to_jsonb(g) into rev,before_row from public.recruitment_staff_scopes g where user_id=target and scope_id=scope;
  if coalesce(rev,-1)<>(p_data->>'expectedRevision')::integer then raise exception 'Scope permissions changed. Refresh and review again.';end if;
  insert into public.recruitment_staff_scopes(user_id,scope_id,enabled,granted_by) values(target,scope,(p_data->>'enabled')::boolean,p_actor)
  on conflict(user_id,scope_id) do update set enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_staff_scopes.revision+1;
  result=jsonb_build_object('userId',target,'scopeId',scope);
 elsif p_operation='settings' then
  if cfg.revision<>(p_data->>'expectedRevision')::integer then raise exception 'Recruitment settings changed. Refresh and review again.';end if;
  before_row=to_jsonb(cfg)-'bootstrapped_at';
  update public.recruitment_settings set staff_console_enabled=(p_data->>'staffConsoleEnabled')::boolean,access_guards_enabled=(p_data->>'accessGuardsEnabled')::boolean,privacy_policy_version=trim(p_data->>'privacyPolicyVersion'),revision=revision+1 where singleton;
  result=jsonb_build_object('saved',true);
 end if;
 insert into public.recruitment_events(actor_id,action,target_id,request_id,details) values(p_actor,p_operation,coalesce(target,scope),rid,jsonb_build_object('before',before_row,'choices',p_data-'requestId','authority','recruitment_staff'));
 insert into public.recruitment_requests(id,actor_id,operation,payload,result) values(rid,p_actor,p_operation,p_data,result);
 return result;
end$$;
create or replace function public.recruitment_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;begin
 s=public.recruitment_assert(p_actor);
 return jsonb_build_object('user',public.recruitment_context(p_actor),'settings',(select to_jsonb(c)-'bootstrapped_at' from public.recruitment_settings c where singleton),
 'features',jsonb_build_object('publicVacancies',false,'talentPool',false,'applications',false,'uploads',false,'emailDispatch',false,'interviews',false,'decisions',false,'onboarding',false,'activation',false,'compensation',false),
 'staff',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('email',u.email) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id) when s.role='manager' then (select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'email',u.email,'role',r.role,'enabled',r.enabled) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id where r.role='officer' and r.enabled) else '[]'::jsonb end,
 'scopes',(select coalesce(jsonb_agg(to_jsonb(c) order by label),'[]') from public.recruitment_scopes c where s.role='owner' or exists(select 1 from public.recruitment_staff_scopes g where g.scope_id=c.id and g.user_id=p_actor and g.enabled)),
 'grants',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from public.recruitment_staff_scopes g where s.role='owner' or g.user_id=p_actor or (s.role='manager' and exists(select 1 from public.recruitment_staff_scopes own where own.user_id=p_actor and own.scope_id=g.scope_id and own.enabled))),
 'events',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]') from(select * from public.recruitment_events order by created_at desc,id limit 200)e) else '[]'::jsonb end);
end$$;
do $$declare p record;begin
 for p in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'recruitment_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',p.signature);
  if p.proname in ('recruitment_rate_limit','recruitment_context','recruitment_snapshot','recruitment_issue_challenge','recruitment_mutate') then execute format('grant execute on function %s to service_role',p.signature);end if;
 end loop;
end$$;
notify pgrst,'reload schema';

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261109020000_recruitment_security_operations.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261109030000_recruitment_access_guards.sql
-- SHA256 a4f895bd26026c93125fff072a80336a634ad226e04529fabe223e01a4e4a7db
-- Opt-in fence: existing active identities and normal sign-in remain unchanged.
-- No activation bypass or approval-consumption operation ships in Milestone 1.
create or replace function public.recruitment_guard_access() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.recruitment_settings where singleton and access_guards_enabled) then return new;end if;
 if tg_table_name='teaching_tutors' then
  if tg_op='INSERT' then new.enabled=false;
  elsif new.enabled and (not old.enabled or new.email is distinct from old.email) then raise exception 'Owner activation with verified onboarding is not released. Tutor access cannot be enabled.';end if;
 elsif tg_table_name='admin_users' then
  if tg_op='INSERT' then
   if new.enabled then raise exception 'New administrative access requires the reviewed owner activation workflow.';end if;
  elsif new.enabled and (not old.enabled or new.user_id is distinct from old.user_id or
   (case new.finance_role when 'owner' then 3 when 'bookkeeper' then 2 else 1 end) >
   (case old.finance_role when 'owner' then 3 when 'bookkeeper' then 2 else 1 end)) then raise exception 'New administrative permissions require the reviewed owner activation workflow.';end if;
 end if;
 return new;
end$$;
drop trigger if exists recruitment_access_guard on public.teaching_tutors;
create trigger recruitment_access_guard before insert or update on public.teaching_tutors for each row execute function public.recruitment_guard_access();
drop trigger if exists recruitment_access_guard on public.admin_users;
create trigger recruitment_access_guard before insert or update on public.admin_users for each row execute function public.recruitment_guard_access();
revoke all on function public.recruitment_guard_access() from public,anon,authenticated,service_role;

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261109030000_recruitment_access_guards.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261109040000_recruitment_security_remediation.sql
-- SHA256 242292ccce6265b22186ead49be021c8c2f5f4e9f856c4181e640808690e6ed5
-- M1 security remediation. Additive upgrade from 3f1ffee; no production flags enabled.
alter table public.recruitment_settings add column if not exists access_guards_mandatory boolean not null default false;
alter table public.recruitment_settings add column if not exists owner_aal2_required boolean not null default false;
create table if not exists public.recruitment_operational_events (
 id uuid primary key default gen_random_uuid(), action text not null,
 database_actor text not null, operator_reference text not null,
 approval_reference text not null, reason text not null,
 target_user_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
-- Retain established UUIDs across Auth deletion. No names/emails or Auth cascade here.
create table if not exists public.recruitment_tutor_bindings (
 tutor_id uuid primary key references public.teaching_tutors(id),
 established_user_id uuid, history_unresolved boolean not null default false, established_at timestamptz not null default now()
);
insert into public.recruitment_tutor_bindings(tutor_id,established_user_id)
 select id,user_id from public.teaching_tutors where user_id is not null on conflict do nothing;
-- Recover cleared bindings from immutable teaching history; never infer identity from email.
insert into public.recruitment_tutor_bindings(tutor_id,established_user_id)
 select distinct on(t.id) t.id,(entry.snapshot->>'user_id')::uuid
 from public.teaching_tutors t join public.teaching_events e
 on e.action in ('teaching_tutors:insert','teaching_tutors:update')
 cross join lateral (values(e.details->'after',1),(e.details->'before',0)) entry(snapshot,priority)
 where t.user_id is null and entry.snapshot->>'id'=t.id::text
 and entry.snapshot->>'user_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 order by t.id,e.created_at desc,e.id desc,entry.priority desc on conflict do nothing;
-- Evidence of prior sign-in without recoverable UUID is quarantined, not treated as first binding.
insert into public.recruitment_tutor_bindings(tutor_id,established_user_id,history_unresolved)
 select id,null,true from public.teaching_tutors where user_id is null and last_signed_in_at is not null on conflict do nothing;
create table if not exists public.recruitment_tutor_rebind_authorizations (
 id uuid primary key default gen_random_uuid(), tutor_id uuid not null references public.teaching_tutors(id),
 prior_user_id uuid, target_user_id uuid not null references auth.users(id),
 owner_id uuid not null references auth.users(id),
 operational_event_id uuid not null references public.recruitment_operational_events(id),
 expires_at timestamptz not null default now()+interval '1 hour', consumed_at timestamptz,
 check(owner_id<>target_user_id), check(prior_user_id<>target_user_id)
);
do $$declare t text;begin
 foreach t in array array['recruitment_operational_events','recruitment_tutor_bindings','recruitment_tutor_rebind_authorizations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;
drop trigger if exists recruitment_immutable on public.recruitment_operational_events;
create trigger recruitment_immutable before update or delete on public.recruitment_operational_events for each row execute function public.recruitment_immutable();

create or replace function public.recruitment_authorize(p_actor uuid,p_operation text,p_data jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff; target uuid; scope uuid; allowed text[];begin
 s=public.recruitment_assert(p_actor);
 if p_operation not in ('staff_grant','scope_create','scope_grant','settings') then raise exception 'This recruitment operation has not been released.';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or nullif(p_data->>'requestId','') is null then raise exception 'Choose a stable request and valid details.';end if;
 allowed=case p_operation when 'staff_grant' then array['requestId','userId','role','enabled','expectedRevision'] when 'scope_grant' then array['requestId','userId','scopeId','enabled','expectedRevision'] when 'scope_create' then array['requestId','kind','label'] else array['requestId','expectedRevision','staffConsoleEnabled','accessGuardsEnabled','privacyPolicyVersion'] end;
 if not (p_data ?& allowed) or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(allowed))) then raise exception 'Only the released security fields are accepted.';end if;
 if p_operation in ('staff_grant','scope_grant') and (jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or (p_data->>'expectedRevision')::integer < -1) then raise exception 'Choose a state and expected revision.';end if;
 if p_operation='settings' and (jsonb_typeof(p_data->'staffConsoleEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'accessGuardsEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or jsonb_typeof(p_data->'privacyPolicyVersion') is distinct from 'string') then raise exception 'Choose valid rollout controls.';end if;
 if p_operation='settings' and (p_data->>'staffConsoleEnabled')::boolean and not (p_data->>'accessGuardsEnabled')::boolean then raise exception 'Enable the access safeguards before enabling the staff console.';end if;
 if p_operation<>'scope_grant' then perform public.recruitment_assert(p_actor,true);
 else
  target=(p_data->>'userId')::uuid;scope=(p_data->>'scopeId')::uuid;
  if not exists(select 1 from public.recruitment_staff where user_id=target) or not exists(select 1 from public.recruitment_scopes where id=scope) then raise exception 'Choose an existing recruitment staff identity and scope.';end if;
  if s.role<>'owner' and (s.role<>'manager' or not exists(select 1 from public.recruitment_staff_scopes where user_id=p_actor and scope_id=scope and enabled) or not exists(select 1 from public.recruitment_staff where user_id=target and role='officer' and enabled) or not exists(select 1 from public.recruitment_staff_scopes where user_id=target and scope_id=scope)) then raise exception 'Scope delegation is not permitted.';end if;
 end if;
 if p_operation in ('staff_grant','scope_grant') and (p_data->>'userId')::uuid=p_actor then raise exception 'You cannot change your own recruitment grants.';end if;
end$$;

-- Replace insecure/obsolete signatures, so PostgREST cannot select a weaker overload.
drop function if exists public.recruitment_bootstrap(uuid);
drop function if exists public.recruitment_issue_challenge(uuid,text,text,jsonb,text);
drop function if exists public.recruitment_mutate(uuid,text,jsonb,text,text);
create or replace function public.recruitment_require_assurance(p_actor uuid,p_aal text) returns void
language plpgsql stable security definer set search_path='' as $$begin
 if not exists(select 1 from public.recruitment_settings where singleton) then raise exception 'Recruitment configuration is missing.';end if;
 if exists(select 1 from public.recruitment_staff where user_id=p_actor and role='owner')
 and exists(select 1 from public.recruitment_settings where singleton and owner_aal2_required)
 and p_aal is distinct from 'aal2' then raise exception 'Owner MFA assurance (AAL2) is required for this operation.';end if;
end$$;
create or replace function public.recruitment_issue_challenge(p_actor uuid,p_session_hash text,p_operation text,p_data jsonb,p_secret_hash text,p_aal text default 'aal1') returns void
language plpgsql security definer set search_path='' as $$begin
 perform public.recruitment_authorize(p_actor,p_operation,p_data);
 perform public.recruitment_require_assurance(p_actor,p_aal);
 if p_session_hash !~ '^[0-9a-f]{64}$' or p_secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid verification proof.';end if;
 delete from public.recruitment_reauth_challenges where expires_at<now()-interval '1 day';
 insert into public.recruitment_reauth_challenges(secret_hash,actor_id,session_hash,operation,payload,expires_at) values(p_secret_hash,p_actor,p_session_hash,p_operation,p_data,now()+interval '5 minutes');
end$$;
create or replace function public.recruitment_mutate(p_actor uuid,p_operation text,p_data jsonb,p_session_hash text,p_proof_hash text,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.recruitment_settings; prior public.recruitment_requests; staff public.recruitment_staff;
 rid uuid=(p_data->>'requestId')::uuid; target uuid; scope uuid; rev integer; result jsonb; before_row jsonb;
begin
 select * into cfg from public.recruitment_settings where singleton for update;
 perform public.recruitment_authorize(p_actor,p_operation,p_data);
 perform public.recruitment_require_assurance(p_actor,p_aal);
 if rid is null then raise exception 'A stable request ID is required.';end if;
 select * into prior from public.recruitment_requests where id=rid;
 if prior.id is not null then
  if prior.actor_id<>p_actor or prior.operation<>p_operation or prior.payload<>p_data then raise exception 'Request ID conflicts with an earlier operation.';end if;
  return prior.result;
 end if;
 update public.recruitment_reauth_challenges set consumed_at=now()
 where secret_hash=p_proof_hash and actor_id=p_actor and session_hash=p_session_hash and operation=p_operation and payload=p_data and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'Fresh action-specific authentication is required.';end if;
 if p_operation='staff_grant' then
  target=(p_data->>'userId')::uuid;
  select * into staff from public.recruitment_staff where user_id=target;
  -- Verification gates additions/elevation, never removal of existing authority.
  if (staff.user_id is null or ((p_data->>'enabled')::boolean and (not staff.enabled or
      (case p_data->>'role' when 'owner' then 3 when 'manager' then 2 else 1 end) >
      (case staff.role when 'owner' then 3 when 'manager' then 2 else 1 end))))
      and not exists(select 1 from auth.users where id=target and email_confirmed_at is not null)
  then raise exception 'Choose an existing verified Auth identity for new or increased access.';end if;
  if coalesce(staff.revision,-1)<>(p_data->>'expectedRevision')::integer then raise exception 'Staff permissions changed. Refresh and review again.';end if;
  if staff.role='owner' and staff.enabled and (p_data->>'role'<>'owner' or not (p_data->>'enabled')::boolean) and (select count(*) from public.recruitment_staff where role='owner' and enabled)<=1 then raise exception 'Keep at least one enabled recruitment owner.';end if;
  before_row=jsonb_build_object('role',staff.role,'enabled',staff.enabled,'revision',staff.revision);
  insert into public.recruitment_staff(user_id,role,enabled,granted_by) values(target,p_data->>'role',(p_data->>'enabled')::boolean,p_actor)
  on conflict(user_id) do update set role=excluded.role,enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_staff.revision+1,updated_at=now();
  result=jsonb_build_object('userId',target);
 elsif p_operation='scope_create' then
  if p_data->>'kind'='talent_pool' and exists(select 1 from public.recruitment_scopes where kind='talent_pool') then raise exception 'The talent-pool scope already exists. Choose the existing scope.';end if;
  insert into public.recruitment_scopes(kind,label) values(p_data->>'kind',trim(p_data->>'label')) returning id into scope;
  result=jsonb_build_object('scopeId',scope);
 elsif p_operation='scope_grant' then
  target=(p_data->>'userId')::uuid;scope=(p_data->>'scopeId')::uuid;
  select revision,to_jsonb(g) into rev,before_row from public.recruitment_staff_scopes g where user_id=target and scope_id=scope;
  if (p_data->>'enabled')::boolean and not coalesce((before_row->>'enabled')::boolean,false)
  and not exists(select 1 from auth.users where id=target and email_confirmed_at is not null)
  then raise exception 'Choose an existing verified Auth identity for new or increased scope access.';end if;
  if coalesce(rev,-1)<>(p_data->>'expectedRevision')::integer then raise exception 'Scope permissions changed. Refresh and review again.';end if;
  insert into public.recruitment_staff_scopes(user_id,scope_id,enabled,granted_by) values(target,scope,(p_data->>'enabled')::boolean,p_actor)
  on conflict(user_id,scope_id) do update set enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_staff_scopes.revision+1;
  result=jsonb_build_object('userId',target,'scopeId',scope);
 elsif p_operation='settings' then
  if cfg.access_guards_mandatory and not (p_data->>'accessGuardsEnabled')::boolean then
   raise exception 'Mandatory access safeguards require separately approved operational intervention.';
  end if;
  if cfg.revision<>(p_data->>'expectedRevision')::integer then raise exception 'Recruitment settings changed. Refresh and review again.';end if;
  before_row=to_jsonb(cfg)-'bootstrapped_at';
  update public.recruitment_settings set staff_console_enabled=(p_data->>'staffConsoleEnabled')::boolean,access_guards_enabled=(p_data->>'accessGuardsEnabled')::boolean,privacy_policy_version=trim(p_data->>'privacyPolicyVersion'),revision=revision+1 where singleton;
  result=jsonb_build_object('saved',true);
 end if;
 insert into public.recruitment_events(actor_id,action,target_id,request_id,details) values(p_actor,p_operation,coalesce(target,scope),rid,jsonb_build_object('before',before_row,'choices',p_data-'requestId','authority','recruitment_staff'));
 insert into public.recruitment_requests(id,actor_id,operation,payload,result) values(rid,p_actor,p_operation,p_data,result);
 return result;
end$$;
create or replace function public.recruitment_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;begin
 s=public.recruitment_assert(p_actor);
 return jsonb_build_object('user',public.recruitment_context(p_actor),'settings',(select to_jsonb(c)-'bootstrapped_at' from public.recruitment_settings c where singleton),
 'features',jsonb_build_object('publicVacancies',false,'talentPool',false,'applications',false,'uploads',false,'emailDispatch',false,'interviews',false,'decisions',false,'onboarding',false,'activation',false,'compensation',false),
 'staff',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('email',u.email) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id) when s.role='manager' then (select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'email',u.email,'role',r.role,'enabled',r.enabled) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id where r.role='officer' and r.enabled and exists(
   select 1 from public.recruitment_staff_scopes mg join public.recruitment_staff_scopes og on og.scope_id=mg.scope_id
   where mg.user_id=p_actor and mg.enabled and og.user_id=r.user_id )) else '[]'::jsonb end,
 'scopes',(select coalesce(jsonb_agg(to_jsonb(c) order by label),'[]') from public.recruitment_scopes c where s.role='owner' or exists(select 1 from public.recruitment_staff_scopes g where g.scope_id=c.id and g.user_id=p_actor and g.enabled)),
 'grants',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from public.recruitment_staff_scopes g where s.role='owner' or g.user_id=p_actor or (s.role='manager' and exists(select 1 from public.recruitment_staff_scopes own where own.user_id=p_actor and own.scope_id=g.scope_id and own.enabled))),
 'events',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]') from(select * from public.recruitment_events order by created_at desc,id limit 200)e) else '[]'::jsonb end);
end$$;
-- Context exposes enforcement state, never an operational ability to change it.
create or replace function public.recruitment_context(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;begin
 s=public.recruitment_assert(p_actor);
 return jsonb_build_object('id',s.user_id,'role',s.role,'revision',s.revision,
 'email',(select email from auth.users where id=p_actor),
 'ownerAal2Required',(select owner_aal2_required from public.recruitment_settings where singleton));
end$$;

-- Only a separately authorized database operator can execute this function.
-- Evidence identifiers refer to protected change-management records, never passwords/tokens.
create or replace function public.recruitment_operate(
 p_action text,p_operator_reference text,p_approval_reference text,p_reason text,
 p_target uuid default null,p_owner uuid default null,p_tutor uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid; before_cfg jsonb; binding public.recruitment_tutor_bindings;begin
 if length(trim(coalesce(p_operator_reference,''))) not between 3 and 160
 or length(trim(coalesce(p_approval_reference,''))) not between 3 and 160
 or length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Operator, independent approval reference and reason are required.';end if;
 if p_action not in ('bootstrap_owner','recover_owner','lock_safeguards','exception_disable_safeguards','restore_safeguards','require_owner_mfa','exception_suspend_owner_mfa','authorize_tutor_rebind') then raise exception 'Unknown operational procedure.';end if;
 select to_jsonb(c) into before_cfg from public.recruitment_settings c where singleton for update;
 if before_cfg is null then raise exception 'Recruitment configuration is missing.';end if;
 if p_action in ('bootstrap_owner','recover_owner','authorize_tutor_rebind') and not exists(select 1 from auth.users where id=p_target and email_confirmed_at is not null) then raise exception 'Choose an existing verified recovery/target identity.';end if;
 if p_action='bootstrap_owner' then
  if (before_cfg->>'bootstrapped_at') is not null or exists(select 1 from public.recruitment_staff) then raise exception 'Recruitment was already bootstrapped.';end if;
 elsif p_action='recover_owner' then
  if (before_cfg->>'bootstrapped_at') is null then raise exception 'Use the initial bootstrap procedure.';end if;
 elsif p_action='authorize_tutor_rebind' then
  perform public.recruitment_assert(p_owner,true);
  if p_owner=p_target then raise exception 'An owner cannot approve their own replacement identity.';end if;
  select * into binding from public.recruitment_tutor_bindings where tutor_id=p_tutor for update;
  if binding.tutor_id is null or binding.established_user_id is not distinct from p_target
  or not exists(select 1 from public.teaching_tutors where id=p_tutor and enabled) then raise exception 'Choose an established active tutor and a replacement identity.';end if;
 end if;
 insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,target_user_id,details)
 values(p_action,session_user,p_operator_reference,p_approval_reference,p_reason,p_target,
 jsonb_build_object('before',before_cfg,'ownerId',p_owner,'tutorId',p_tutor)) returning id into eid;
 if p_action in ('bootstrap_owner','recover_owner') then
  insert into public.recruitment_staff(user_id,role,enabled,granted_by) values(p_target,'owner',true,p_target)
  on conflict(user_id) do update set role='owner',enabled=true,revision=recruitment_staff.revision+1,granted_by=p_target,updated_at=now();
  update public.recruitment_settings set bootstrapped_at=coalesce(bootstrapped_at,now()),revision=revision+1 where singleton;
  insert into public.recruitment_events(actor_id,action,target_id,details) values(p_target,p_action,p_target,jsonb_build_object('operationalEventId',eid,'authority','separately authorized database operation'));
 elsif p_action in ('lock_safeguards','restore_safeguards') then
  update public.recruitment_settings set access_guards_mandatory=true,access_guards_enabled=true,revision=revision+1 where singleton;
 elsif p_action='exception_disable_safeguards' then
  update public.recruitment_settings set access_guards_enabled=false,staff_console_enabled=false,revision=revision+1 where singleton;
 elsif p_action='require_owner_mfa' then
  update public.recruitment_settings set owner_aal2_required=true,revision=revision+1 where singleton;
 elsif p_action='exception_suspend_owner_mfa' then
  update public.recruitment_settings set owner_aal2_required=false,revision=revision+1 where singleton;
 elsif p_action='authorize_tutor_rebind' then
  insert into public.recruitment_tutor_rebind_authorizations(tutor_id,prior_user_id,target_user_id,owner_id,operational_event_id)
  values(p_tutor,binding.established_user_id,p_target,p_owner,eid);
 end if;
 return eid;
end$$;
create or replace function public.recruitment_bootstrap(p_user uuid,p_operator_reference text,p_approval_reference text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$begin
 perform public.recruitment_operate('bootstrap_owner',p_operator_reference,p_approval_reference,p_reason,p_user);
end$$;

-- UUID-only browser recovery. Payloads remain server-side and require current authority.
create or replace function public.recruitment_recover_request(p_actor uuid,p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare op text; data jsonb; done boolean=false;begin
 perform public.recruitment_assert(p_actor);
 select operation,payload,true into op,data,done from public.recruitment_requests where id=p_request_id and actor_id=p_actor;
 if op is null then
  select operation,payload,false into op,data,done from public.recruitment_reauth_challenges
  where actor_id=p_actor and payload->>'requestId'=p_request_id::text order by expires_at desc limit 1;
 end if;
 if op is null then raise exception 'No recoverable request exists for this identity. Contact an owner before starting another operation.';end if;
 perform public.recruitment_authorize(p_actor,op,data);
 return jsonb_build_object('operation',op,'data',data,'completed',done);
end$$;

-- Always retain binding history, including while the legacy access fence is off.
create or replace function public.recruitment_guard_tutor_binding() returns trigger
language plpgsql security definer set search_path='' as $$
declare established uuid; unresolved boolean; authz uuid;begin
 if tg_op='UPDATE' and old.user_id is not null then
  insert into public.recruitment_tutor_bindings(tutor_id,established_user_id) values(old.id,old.user_id) on conflict do nothing;
 end if;
 select established_user_id,history_unresolved into established,unresolved from public.recruitment_tutor_bindings where tutor_id=new.id for update;
 if new.user_id is not null and (established is not null or unresolved) and new.user_id is distinct from established then
  select a.id into authz from public.recruitment_tutor_rebind_authorizations a
  join public.recruitment_staff s on s.user_id=a.owner_id and s.role='owner' and s.enabled
  join auth.users u on u.id=s.user_id and u.email_confirmed_at is not null
  where a.tutor_id=new.id and a.prior_user_id is not distinct from established and a.target_user_id=new.user_id
  and a.owner_id<>new.user_id and a.consumed_at is null and a.expires_at>clock_timestamp()
  order by a.expires_at desc limit 1 for update of a for share of s;
  if authz is null then raise exception 'Replacement tutor identities require explicit owner-approved access authorization.';end if;
  update public.recruitment_tutor_rebind_authorizations set consumed_at=now() where id=authz;
  update public.recruitment_tutor_bindings set established_user_id=new.user_id,history_unresolved=false,established_at=now() where tutor_id=new.id;
  insert into public.recruitment_events(actor_id,action,target_id,details)
   select owner_id,'tutor_identity_rebound',new.id,jsonb_build_object('authorizationId',authz,'priorUserId',established,'targetUserId',new.user_id)
   from public.recruitment_tutor_rebind_authorizations where id=authz;
 end if;
 return new;
end$$;
-- AFTER is intentional: new tutor FK exists, while exceptions still roll back the entire write.
create or replace function public.recruitment_record_tutor_binding() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.user_id is not null then insert into public.recruitment_tutor_bindings(tutor_id,established_user_id) values(new.id,new.user_id) on conflict do nothing;end if;
 return new;
end$$;
drop trigger if exists recruitment_identity_guard on public.teaching_tutors;
create trigger recruitment_identity_guard before update on public.teaching_tutors for each row execute function public.recruitment_guard_tutor_binding();
drop trigger if exists recruitment_identity_record on public.teaching_tutors;
create trigger recruitment_identity_record after insert or update on public.teaching_tutors for each row execute function public.recruitment_record_tutor_binding();
create or replace function public.recruitment_guard_access() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.recruitment_settings where singleton) then raise exception 'Recruitment configuration is missing.';end if;
 if not exists(select 1 from public.recruitment_settings where singleton and access_guards_enabled) then return new;end if;
 if tg_table_name='teaching_tutors' then
  if tg_op='INSERT' then new.enabled=false;
  elsif new.enabled and (not old.enabled or new.email is distinct from old.email) then raise exception 'Owner activation with verified onboarding is not released. Tutor access cannot be enabled.';end if;
 elsif tg_table_name='admin_users' then
  if tg_op='INSERT' then
   if new.enabled then raise exception 'New administrative access requires the reviewed owner activation workflow.';end if;
  elsif new.enabled and (not old.enabled or new.user_id is distinct from old.user_id or
   (case new.finance_role when 'owner' then 3 when 'bookkeeper' then 2 else 1 end) >
   (case old.finance_role when 'owner' then 3 when 'bookkeeper' then 2 else 1 end)) then raise exception 'New administrative permissions require the reviewed owner activation workflow.';end if;
 end if;
 return new;
end$$;

-- Explicit signatures prevent accidental grants to similarly named overloads.
revoke all on function public.recruitment_require_assurance(uuid,text),public.recruitment_operate(text,text,text,text,uuid,uuid,uuid),public.recruitment_bootstrap(uuid,text,text,text),public.recruitment_guard_tutor_binding(),public.recruitment_record_tutor_binding(),public.recruitment_guard_access(),public.recruitment_issue_challenge(uuid,text,text,jsonb,text,text),public.recruitment_mutate(uuid,text,jsonb,text,text,text),public.recruitment_recover_request(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_issue_challenge(uuid,text,text,jsonb,text,text),public.recruitment_mutate(uuid,text,jsonb,text,text,text),public.recruitment_recover_request(uuid,uuid) to service_role;
notify pgrst,'reload schema';

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261109040000_recruitment_security_remediation.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261109050000_recruitment_vacancies.sql
-- SHA256 f5d99995c17fcfcf481e663e18ce09b496456cdd79c8b85c860e80a5a2abf1ab
-- Milestone 2: additive vacancy management. Public visibility defaults OFF.
-- Apply in a transaction only after target-schema inspection and explicit approval.
alter table public.recruitment_settings add column if not exists public_vacancies_enabled boolean not null default false;
alter table public.recruitment_settings add column if not exists public_vacancies_generation bigint not null default 0 check(public_vacancies_generation>=0);
create sequence if not exists public.recruitment_vacancy_reference_seq;

create or replace function public.recruitment_vacancy_content_valid(c jsonb,p_complete boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; x jsonb; n integer; opens timestamptz; closes timestamptz;
 keys text[]=array['title','category','engagementType','department','location','workArrangement','summary','responsibilities','minimumRequirements','preferredQualifications','requiredExperience','skills','subjects','grades','scheduleType','scheduleDetails','positions','opensAt','closesAt','remuneration','requiredDocuments','questions'];
begin
 if jsonb_typeof(c) is distinct from 'object' or not(c ?& keys) or exists(select 1 from jsonb_object_keys(c) z where not(z=any(keys))) or octet_length(c::text)>16000 then return false;end if;
 foreach k in array array['title','category','engagementType','department','location','workArrangement','summary','requiredExperience','scheduleType','scheduleDetails','remuneration'] loop
  if jsonb_typeof(c->k) is distinct from 'string' then return false;end if;
 end loop;
 if length(trim(c->>'title')) not between 3 and 160 or c->>'category' not in ('tutor','administrator','support_staff')
 or c->>'engagementType' not in ('employee','independent_contractor','volunteer')
 or c->>'workArrangement' not in ('onsite','remote','hybrid') or c->>'scheduleType' not in ('full_time','part_time','flexible')
 or length(c->>'department')>160 or length(c->>'location')>160 or length(c->>'summary')>4000
 or length(c->>'requiredExperience')>2000 or length(c->>'scheduleDetails')>2000 or length(c->>'remuneration')>1000
 or jsonb_typeof(c->'positions') is distinct from 'number' or c->>'positions' !~ '^[0-9]{1,4}$' or (c->>'positions')::integer not between 1 and 1000 then return false;end if;
 foreach k in array array['responsibilities','minimumRequirements','preferredQualifications','skills','subjects','grades'] loop
  if jsonb_typeof(c->k) is distinct from 'array' or jsonb_array_length(c->k)>50 then return false;end if;
  for x in select value from jsonb_array_elements(c->k) loop
   if jsonb_typeof(x) is distinct from 'string' or length(trim(x#>>'{}')) not between 1 and (case when k in ('subjects','grades') then 80 else 1000 end) then return false;end if;
  end loop;
 end loop;
 if c->>'category'<>'tutor' and (jsonb_array_length(c->'subjects')>0 or jsonb_array_length(c->'grades')>0) then return false;end if;
 foreach k in array array['requiredDocuments','questions'] loop
  if jsonb_typeof(c->k) is distinct from 'array' or jsonb_array_length(c->k)>20 then return false;end if;
  if (select count(*)<>count(distinct value->>'key') from jsonb_array_elements(c->k)) then return false;end if;
  for x in select value from jsonb_array_elements(c->k) loop
   if jsonb_typeof(x) is distinct from 'object' or not(x ?& (case when k='questions' then array['key','label','type','required'] else array['key','label','required'] end))
   or exists(select 1 from jsonb_object_keys(x) z where not(z=any(case when k='questions' then array['key','label','type','required'] else array['key','label','required'] end)))
   or jsonb_typeof(x->'key') is distinct from 'string' or x->>'key' !~ '^[a-z][a-z0-9_-]{0,59}$'
   or jsonb_typeof(x->'label') is distinct from 'string' or length(trim(x->>'label')) not between 1 and (case when k='questions' then 500 else 160 end)
   or jsonb_typeof(x->'required') is distinct from 'boolean' then return false;end if;
   if k='questions' and (jsonb_typeof(x->'type') is distinct from 'string' or x->>'type' not in ('text','yes_no','number')) then return false;end if;
  end loop;
 end loop;
 foreach k in array array['opensAt','closesAt'] loop
  if c->k <> 'null'::jsonb then
   if jsonb_typeof(c->k) is distinct from 'string' or c->>'opensAt' !~ '^\d{4}-\d{2}-\d{2}T' and k='opensAt' or c->>'closesAt' !~ '^\d{4}-\d{2}-\d{2}T' and k='closesAt' then return false;end if;
   if (c->>k) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return false;end if;
   perform (c->>k)::timestamptz;
  end if;
 end loop;
 opens=(c->>'opensAt')::timestamptz;closes=(c->>'closesAt')::timestamptz;
 if opens is not null and closes is not null and closes<=opens then return false;end if;
 if p_complete and (length(trim(c->>'department'))=0 or length(trim(c->>'location'))=0 or length(trim(c->>'summary'))<20
 or length(trim(c->>'requiredExperience'))=0 or length(trim(c->>'scheduleDetails'))=0
 or jsonb_array_length(c->'responsibilities')=0 or jsonb_array_length(c->'minimumRequirements')=0
 or opens is null or closes is null or (c->>'category'='tutor' and (jsonb_array_length(c->'subjects')=0 or jsonb_array_length(c->'grades')=0))) then return false;end if;
 return true;
exception when others then return false;
end$$;

create table if not exists public.recruitment_vacancies (
 id uuid primary key default gen_random_uuid(), reference text not null unique,
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 180),
 scope_id uuid not null references public.recruitment_scopes(id),
 revision integer not null default 0 check(revision>=0),
 status text not null default 'draft' check(status in ('draft','submitted','approved','published','paused','closed','archived')),
 review_state text not null default 'draft' check(review_state in ('draft','submitted','approved','revision_requested')),
 draft_version_id uuid not null, approved_version_id uuid, published_version_id uuid,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 approved_by uuid references auth.users(id), approved_at timestamptz,
 published_by uuid references auth.users(id), published_at timestamptz,
 check(status not in ('published','paused') or (published_version_id is not null and published_at is not null)),
 check(status<>'approved' or (approved_version_id is not null and review_state='approved'))
);
create table if not exists public.recruitment_vacancy_versions (
 id uuid primary key default gen_random_uuid(), vacancy_id uuid not null references public.recruitment_vacancies(id),
 number integer not null check(number>=1), content jsonb not null check(public.recruitment_vacancy_content_valid(content,false)),
 category text generated always as (content->>'category') stored check(category in ('tutor','administrator','support_staff')),
 engagement_type text generated always as (content->>'engagementType') stored check(engagement_type in ('employee','independent_contractor','volunteer')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(vacancy_id,number), unique(vacancy_id,id)
);
create table if not exists public.recruitment_vacancy_approvals (
 id uuid primary key default gen_random_uuid(), vacancy_id uuid not null references public.recruitment_vacancies(id),
 version_id uuid not null, owner_id uuid not null references auth.users(id), request_id uuid not null unique,
 created_at timestamptz not null default now(), unique(vacancy_id,version_id),
 foreign key(vacancy_id,version_id) references public.recruitment_vacancy_versions(vacancy_id,id)
);
create table if not exists public.recruitment_vacancy_publications (
 id uuid primary key default gen_random_uuid(), vacancy_id uuid not null references public.recruitment_vacancies(id),
 version_id uuid not null, owner_id uuid not null references auth.users(id), request_id uuid not null unique,
 created_at timestamptz not null default now(),
 foreign key(vacancy_id,version_id) references public.recruitment_vacancy_approvals(vacancy_id,version_id)
);
create table if not exists public.recruitment_vacancy_assignments (
 vacancy_id uuid not null references public.recruitment_vacancies(id), user_id uuid not null references public.recruitment_staff(user_id),
 enabled boolean not null default false, granted_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 primary key(vacancy_id,user_id)
);
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.recruitment_vacancies'::regclass and conname='recruitment_vacancy_draft_fk') then
  alter table public.recruitment_vacancies add constraint recruitment_vacancy_draft_fk foreign key(id,draft_version_id) references public.recruitment_vacancy_versions(vacancy_id,id) deferrable initially deferred;
  alter table public.recruitment_vacancies add constraint recruitment_vacancy_approved_fk foreign key(id,approved_version_id) references public.recruitment_vacancy_approvals(vacancy_id,version_id) deferrable initially deferred;
  alter table public.recruitment_vacancies add constraint recruitment_vacancy_published_fk foreign key(id,published_version_id) references public.recruitment_vacancy_approvals(vacancy_id,version_id) deferrable initially deferred;
 end if;
end$$;
create index if not exists recruitment_vacancy_scope_idx on public.recruitment_vacancies(scope_id,updated_at desc,id);
create index if not exists recruitment_vacancy_status_idx on public.recruitment_vacancies(status,updated_at desc,id);
create index if not exists recruitment_vacancy_assignment_user_idx on public.recruitment_vacancy_assignments(user_id,vacancy_id) where enabled;
do $$declare t text;begin
 foreach t in array array['recruitment_vacancies','recruitment_vacancy_versions','recruitment_vacancy_approvals','recruitment_vacancy_publications','recruitment_vacancy_assignments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach t in array array['recruitment_vacancy_versions','recruitment_vacancy_approvals','recruitment_vacancy_publications'] loop
  execute format('drop trigger if exists recruitment_immutable on public.%I',t);
  execute format('create trigger recruitment_immutable before update or delete on public.%I for each row execute function public.recruitment_immutable()',t);
 end loop;
end$$;
revoke all on sequence public.recruitment_vacancy_reference_seq from public,anon,authenticated,service_role;

create or replace function public.recruitment_vacancy_visible(p_actor uuid,p_vacancy uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;v public.recruitment_vacancies;begin
 s=public.recruitment_assert(p_actor);select * into v from public.recruitment_vacancies where id=p_vacancy;
 return v.id is not null and (s.role='owner' or (exists(select 1 from public.recruitment_staff_scopes where user_id=p_actor and scope_id=v.scope_id and enabled)
 and (s.role='manager' or exists(select 1 from public.recruitment_vacancy_assignments where vacancy_id=v.id and user_id=p_actor and enabled))));
end$$;

create or replace function public.recruitment_vacancy_authorize(p_actor uuid,p_operation text,p_data jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;v public.recruitment_vacancies;scope uuid;allowed text[];begin
 s=public.recruitment_assert(p_actor);
 if p_operation not in ('vacancy_create','vacancy_save','vacancy_submit','vacancy_return','vacancy_approve','vacancy_publish','vacancy_pause','vacancy_close','vacancy_archive','vacancy_revise','vacancy_assign','vacancy_settings') then raise exception 'This vacancy operation is not available.';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>128000 then raise exception 'Choose valid bounded vacancy details.';end if;
 allowed=case p_operation when 'vacancy_create' then array['requestId','scopeId','content'] when 'vacancy_save' then array['requestId','vacancyId','expectedRevision','content'] when 'vacancy_assign' then array['requestId','vacancyId','expectedRevision','userId','enabled'] when 'vacancy_settings' then array['requestId','expectedRevision','publicVacanciesEnabled'] else array['requestId','vacancyId','expectedRevision','reason'] end;
 if not(p_data ?& allowed) or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(allowed))) then raise exception 'Only the released vacancy fields are accepted.';end if;
 if jsonb_typeof(p_data->'requestId') is distinct from 'string' or p_data->>'requestId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'A stable vacancy request ID is required.';end if;
 if p_operation<>'vacancy_create' and (jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or p_data->>'expectedRevision' !~ '^[0-9]{1,10}$' or (p_data->>'expectedRevision')::numeric>2147483646) then raise exception 'Choose the expected vacancy/settings revision.';end if;
 if p_operation in ('vacancy_create','vacancy_save') and not public.recruitment_vacancy_content_valid(p_data->'content',false) then raise exception 'Choose valid vacancy content. Tutor specialization applies only to tutors.';end if;
 if p_operation='vacancy_settings' then
  if s.role<>'owner' then raise exception 'Recruitment owner permission is required.';end if;
  if jsonb_typeof(p_data->'publicVacanciesEnabled') is distinct from 'boolean' then raise exception 'Choose a public vacancy visibility state.';end if;
  return;
 end if;
 if p_operation='vacancy_create' then
  if s.role='officer' then raise exception 'Officers cannot create vacancies.';end if;
  if p_data->'scopeId'='null'::jsonb then
   if s.role<>'owner' then raise exception 'Choose an authorized existing vacancy scope.';end if;
  else
   if jsonb_typeof(p_data->'scopeId') is distinct from 'string' or p_data->>'scopeId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose a valid vacancy scope.';end if;
   scope=(p_data->>'scopeId')::uuid;
   if not exists(select 1 from public.recruitment_scopes where id=scope and kind='vacancy') or (s.role<>'owner' and not exists(select 1 from public.recruitment_staff_scopes where scope_id=scope and user_id=p_actor and enabled)) then raise exception 'An authorized vacancy scope is required.';end if;
  end if;
  return;
 end if;
 if jsonb_typeof(p_data->'vacancyId') is distinct from 'string' or p_data->>'vacancyId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose an existing authorized vacancy.';end if;
 select * into v from public.recruitment_vacancies where id=(p_data->>'vacancyId')::uuid;
 if not public.recruitment_vacancy_visible(p_actor,v.id) then raise exception 'An authorized vacancy is required.';end if;
 if p_operation not in ('vacancy_save','vacancy_submit','vacancy_revise','vacancy_assign') and s.role<>'owner' then raise exception 'Recruitment owner permission is required for this transition.';end if;
 if p_operation='vacancy_assign' then
  if s.role='officer' or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or jsonb_typeof(p_data->'userId') is distinct from 'string' or p_data->>'userId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose an authorized officer assignment.';end if;
  if (p_data->>'userId')::uuid=p_actor then raise exception 'You cannot assign your own vacancy permissions.';end if;
  if not exists(select 1 from public.recruitment_staff where user_id=(p_data->>'userId')::uuid) then raise exception 'Choose an existing recruitment officer.';end if;
  if (p_data->>'enabled')::boolean and not exists(select 1 from public.recruitment_staff target_staff join auth.users u on u.id=target_staff.user_id join public.recruitment_staff_scopes g on g.user_id=target_staff.user_id where target_staff.user_id=(p_data->>'userId')::uuid and target_staff.role='officer' and target_staff.enabled and u.email_confirmed_at is not null and g.scope_id=v.scope_id and g.enabled) then raise exception 'Choose a verified enabled officer with an active grant in this scope.';end if;
 elsif p_operation<>'vacancy_save' then
  if jsonb_typeof(p_data->'reason') is distinct from 'string' or length(p_data->>'reason')>1000 or (p_operation in ('vacancy_return','vacancy_pause','vacancy_close','vacancy_archive') and length(trim(p_data->>'reason'))<3) then raise exception 'Provide a concise reason for this transition.';end if;
 end if;
end$$;

create or replace function public.recruitment_vacancy_mutate(p_actor uuid,p_operation text,p_data jsonb,p_session_hash text,p_proof_hash text,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.recruitment_settings;prior public.recruitment_requests;v public.recruitment_vacancies;content jsonb;before_row jsonb;
 rid uuid;sid uuid;vid uuid;version_number integer;ref_number bigint;result jsonb;begin
 select * into cfg from public.recruitment_settings where singleton for update;
 perform public.recruitment_vacancy_authorize(p_actor,p_operation,p_data);
 perform public.recruitment_require_assurance(p_actor,p_aal);
 rid=(p_data->>'requestId')::uuid;
 select * into prior from public.recruitment_requests where id=rid;
 if prior.id is not null then
  if prior.actor_id<>p_actor or prior.operation<>p_operation or prior.payload<>p_data then raise exception 'Request ID conflicts with an earlier operation.';end if;
  return prior.result;
 end if;
 update public.recruitment_reauth_challenges set consumed_at=now() where secret_hash=p_proof_hash and actor_id=p_actor and session_hash=p_session_hash and operation=p_operation and payload=p_data and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'Fresh action-specific authentication is required.';end if;
 if p_operation='vacancy_settings' then
  if cfg.revision<>(p_data->>'expectedRevision')::integer then raise exception 'Recruitment settings changed. Refresh and review again.';end if;
  update public.recruitment_settings set public_vacancies_enabled=(p_data->>'publicVacanciesEnabled')::boolean,public_vacancies_generation=public_vacancies_generation+1,revision=revision+1 where singleton;
  result=jsonb_build_object('saved',true);
 elsif p_operation='vacancy_create' then
  sid=(p_data->>'scopeId')::uuid;content=p_data->'content';
  if sid is null then insert into public.recruitment_scopes(kind,label) values('vacancy',left(trim(content->>'title'),120)) returning id into sid;end if;
  ref_number=nextval('public.recruitment_vacancy_reference_seq');vid=gen_random_uuid();
  insert into public.recruitment_vacancies(reference,slug,scope_id,draft_version_id,created_by,updated_by)
  values('VIVA-'||extract(year from current_date)::integer||'-'||lpad(ref_number::text,greatest(6,length(ref_number::text)),'0'),'vacancy-'||extract(year from current_date)::integer||'-'||ref_number,sid,vid,p_actor,p_actor) returning * into v;
  insert into public.recruitment_vacancy_versions(id,vacancy_id,number,content,created_by) values(vid,v.id,1,content,p_actor);
  result=jsonb_build_object('saved',true,'vacancyId',v.id,'scopeId',sid,'revision',v.revision);
 else
  select * into v from public.recruitment_vacancies where id=(p_data->>'vacancyId')::uuid for update;
  if v.revision<>(p_data->>'expectedRevision')::integer then raise exception 'Vacancy changed. Refresh and review again.';end if;
  before_row=to_jsonb(v);
  if p_operation='vacancy_assign' then
   if (p_data->>'enabled')::boolean and v.status in ('closed','archived') then raise exception 'Closed vacancies cannot receive new assignments.';end if;
   insert into public.recruitment_vacancy_assignments(vacancy_id,user_id,enabled,granted_by) values(v.id,(p_data->>'userId')::uuid,(p_data->>'enabled')::boolean,p_actor)
   on conflict(vacancy_id,user_id) do update set enabled=excluded.enabled,granted_by=p_actor,updated_at=now();
  elsif v.status in ('closed','archived') and p_operation<>'vacancy_archive' then raise exception 'Closed and archived vacancies cannot be reopened or edited.';
  elsif p_operation='vacancy_save' then
   if v.review_state not in ('draft','revision_requested') then raise exception 'Create an approved vacancy revision or return the submission before editing.';end if;
   content=p_data->'content';select max(number)+1 into version_number from public.recruitment_vacancy_versions where vacancy_id=v.id;vid=gen_random_uuid();
   insert into public.recruitment_vacancy_versions(id,vacancy_id,number,content,created_by) values(vid,v.id,version_number,content,p_actor);
   update public.recruitment_vacancies set draft_version_id=vid,review_state='draft',status=case when status in ('published','paused') then status else 'draft' end where id=v.id;
  elsif p_operation='vacancy_revise' then
   if v.review_state<>'approved' or v.status not in ('approved','published','paused') then raise exception 'Only an approved vacancy can start a new revision.';end if;
   select x.content into content from public.recruitment_vacancy_versions x where id=v.draft_version_id;
   -- New immutable snapshot identifies the revision independently of its approved ancestor.
   select max(number)+1 into version_number from public.recruitment_vacancy_versions where vacancy_id=v.id;vid=gen_random_uuid();
   insert into public.recruitment_vacancy_versions(id,vacancy_id,number,content,created_by) values(vid,v.id,version_number,content,p_actor);
   update public.recruitment_vacancies set draft_version_id=vid,review_state='draft',status=case when status in ('published','paused') then status else 'draft' end where id=v.id;
  elsif p_operation='vacancy_submit' then
   if v.review_state not in ('draft','revision_requested') then raise exception 'Only a draft can be submitted for approval.';end if;
   select x.content into content from public.recruitment_vacancy_versions x where id=v.draft_version_id;
   if not public.recruitment_vacancy_content_valid(content,true) or (content->>'closesAt')::timestamptz<=clock_timestamp() then raise exception 'Complete all required fields and future dates before submission.';end if;
   update public.recruitment_vacancies set review_state='submitted',status=case when status in ('published','paused') then status else 'submitted' end where id=v.id;
  elsif p_operation='vacancy_return' then
   if v.review_state<>'submitted' then raise exception 'Only a submitted vacancy can be returned for revision.';end if;
   update public.recruitment_vacancies set review_state='revision_requested',status=case when status in ('published','paused') then status else 'draft' end where id=v.id;
  elsif p_operation='vacancy_approve' then
   if v.review_state<>'submitted' then raise exception 'Submit this version before owner approval.';end if;
   select x.content into content from public.recruitment_vacancy_versions x where id=v.draft_version_id;
   if not public.recruitment_vacancy_content_valid(content,true) or (content->>'closesAt')::timestamptz<=clock_timestamp() then raise exception 'The vacancy requires complete content and a future closing date.';end if;
   insert into public.recruitment_vacancy_approvals(vacancy_id,version_id,owner_id,request_id) values(v.id,v.draft_version_id,p_actor,rid);
   update public.recruitment_vacancies set approved_version_id=draft_version_id,approved_by=p_actor,approved_at=now(),review_state='approved',status=case when status in ('published','paused') then status else 'approved' end where id=v.id;
  elsif p_operation='vacancy_publish' then
   if v.review_state<>'approved' or v.approved_version_id is distinct from v.draft_version_id or v.status not in ('approved','published','paused') then raise exception 'Only the current owner-approved version can be published.';end if;
   if v.status='published' and v.published_version_id=v.approved_version_id then raise exception 'This approved version is already published.';end if;
   select x.content into content from public.recruitment_vacancy_versions x where id=v.approved_version_id;
   if not public.recruitment_vacancy_content_valid(content,true) or (content->>'closesAt')::timestamptz<=clock_timestamp() then raise exception 'An expired vacancy cannot be published.';end if;
   insert into public.recruitment_vacancy_publications(vacancy_id,version_id,owner_id,request_id) values(v.id,v.approved_version_id,p_actor,rid);
   update public.recruitment_vacancies set published_version_id=approved_version_id,published_by=p_actor,published_at=now(),status='published' where id=v.id;
   update public.recruitment_settings set public_vacancies_generation=public_vacancies_generation+1 where singleton;
  elsif p_operation='vacancy_pause' then
   if v.status<>'published' then raise exception 'Only a published vacancy can be paused.';end if;
   update public.recruitment_vacancies set status='paused' where id=v.id;
   update public.recruitment_settings set public_vacancies_generation=public_vacancies_generation+1 where singleton;
  elsif p_operation='vacancy_close' then
   update public.recruitment_vacancies set status='closed' where id=v.id;
   if v.status='published' then update public.recruitment_settings set public_vacancies_generation=public_vacancies_generation+1 where singleton;end if;
  elsif p_operation='vacancy_archive' then
   if v.status<>'closed' then raise exception 'Only a closed vacancy can be archived.';end if;
   update public.recruitment_vacancies set status='archived' where id=v.id;
  else raise exception 'This vacancy operation is not available.';
  end if;
  update public.recruitment_vacancies set revision=revision+1,updated_by=p_actor,updated_at=now() where id=v.id returning * into v;
  result=jsonb_build_object('saved',true,'vacancyId',v.id,'scopeId',v.scope_id,'revision',v.revision);
 end if;
 insert into public.recruitment_events(actor_id,action,target_id,request_id,details) values(p_actor,p_operation,v.id,rid,jsonb_build_object('vacancyId',v.id,'versionId',coalesce(vid,v.draft_version_id),'before',before_row,'choices',p_data-'requestId'-'content','authority','recruitment_staff'));
 insert into public.recruitment_requests(id,actor_id,operation,payload,result) values(rid,p_actor,p_operation,p_data,result);
 return result;
end$$;

create or replace function public.recruitment_vacancy_workspace(p_actor uuid,p_vacancy uuid default null,p_offset integer default 0,p_history_before integer default null,p_search text default '',p_status text default '',p_category text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;ids uuid[];vrows jsonb;versions jsonb;history_cursor integer;history_more boolean;total integer;begin
 s=public.recruitment_assert(p_actor);
 if p_offset is null or p_offset<0 or p_offset>100000 or p_search is null or length(p_search)>160 or p_status is null or p_status not in ('','draft','submitted','approved','published','paused','closed','archived') or p_category is null or p_category not in ('','tutor','administrator','support_staff') or (p_history_before is not null and p_history_before<1) then raise exception 'Choose a valid vacancy/history page.';end if;
 if p_vacancy is not null and not public.recruitment_vacancy_visible(p_actor,p_vacancy) then raise exception 'An authorized vacancy is required.';end if;
 select count(*) into total from public.recruitment_vacancies v join public.recruitment_vacancy_versions x on x.id=v.draft_version_id
 where public.recruitment_vacancy_visible(p_actor,v.id) and (p_status='' or v.status=p_status) and (p_category='' or x.category=p_category)
 and (p_search='' or position(lower(p_search) in lower(x.content->>'title'||' '||v.reference))>0);
 select array_agg(id) into ids from(select v.id from public.recruitment_vacancies v join public.recruitment_vacancy_versions x on x.id=v.draft_version_id
 where (p_vacancy is null or v.id=p_vacancy) and public.recruitment_vacancy_visible(p_actor,v.id)
 and (p_vacancy is not null or ((p_status='' or v.status=p_status) and (p_category='' or x.category=p_category)
 and (p_search='' or position(lower(p_search) in lower(x.content->>'title'||' '||v.reference))>0)))
 order by v.updated_at desc,v.id limit 50 offset case when p_vacancy is null then p_offset else 0 end)q;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'reference',v.reference,'slug',v.slug,'scopeId',v.scope_id,'revision',v.revision,'status',v.status,'reviewState',v.review_state,'draftVersionId',v.draft_version_id,'approvedVersionId',v.approved_version_id,'publishedVersionId',v.published_version_id,'createdBy',v.created_by,'updatedBy',v.updated_by,'createdAt',v.created_at,'updatedAt',v.updated_at,'approvedBy',v.approved_by,'approvedAt',v.approved_at,'publishedBy',v.published_by,'publishedAt',v.published_at) order by v.updated_at desc,v.id),'[]') into vrows from public.recruitment_vacancies v where id=any(ids);
 if p_vacancy is not null then
  select min(number),count(*)=50 into history_cursor,history_more from(select number from public.recruitment_vacancy_versions where vacancy_id=p_vacancy and (p_history_before is null or number<p_history_before) order by number desc limit 50)q;
  history_more=exists(select 1 from public.recruitment_vacancy_versions where vacancy_id=p_vacancy and number<history_cursor);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'vacancyId',x.vacancy_id,'number',x.number,'content',x.content,'createdBy',x.created_by,'createdAt',x.created_at) order by x.vacancy_id,x.number desc),'[]') into versions
 from public.recruitment_vacancy_versions x where x.vacancy_id=any(ids) and (x.id in(select unnest(case when p_vacancy is null then array[v.draft_version_id] else array[v.draft_version_id,v.approved_version_id,v.published_version_id] end) from public.recruitment_vacancies v where v.id=any(ids)) or (p_vacancy is not null and x.number in(select number from public.recruitment_vacancy_versions where vacancy_id=p_vacancy and (p_history_before is null or number<p_history_before) order by number desc limit 50)));
 return jsonb_build_object('vacancies',vrows,'versions',versions,
 'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('details',jsonb_set(e.details,'{choices}',coalesce(e.details->'choices','{}'::jsonb)-'content')) order by created_at desc,id),'[]') from(select * from public.recruitment_events where (target_id=any(ids) and action like 'vacancy_%') or (s.role='owner' and action='vacancy_settings') order by created_at desc,id limit 200)e),
 'assignments',(select coalesce(jsonb_agg(jsonb_build_object('vacancyId',vacancy_id,'userId',user_id,'enabled',enabled)),'[]') from public.recruitment_vacancy_assignments where vacancy_id=any(ids)),
 'publicVacanciesEnabled',(select public_vacancies_enabled from public.recruitment_settings where singleton),
 'settingsRevision',(select revision from public.recruitment_settings where singleton),
 'total',total,'offset',p_offset,'nextOffset',case when p_vacancy is null and total>p_offset+50 then p_offset+50 else null end,
 'historyBefore',case when history_more then history_cursor else null end,'versionsHasMore',coalesce(history_more,false));
end$$;

-- Public projection never contains draft pointers, user identifiers, assignments or audit data.
create or replace function public.recruitment_public_vacancies(p_slug text default null,p_offset integer default 0,p_category text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cfg public.recruitment_settings;items jsonb;total integer;begin
 select * into cfg from public.recruitment_settings where singleton;
 if cfg.singleton is null then raise exception 'Recruitment configuration is missing.';end if;
 if p_offset is null or p_offset<0 or p_offset>100000 or p_category is null or p_category not in ('','tutor','administrator','support_staff') then raise exception 'Choose a valid public vacancy page and category.';end if;
 if not cfg.public_vacancies_enabled then return jsonb_build_object('enabled',false,'generation',cfg.public_vacancies_generation,'vacancies','[]'::jsonb,'total',0,'nextOffset',null);end if;
 if p_slug is not null and (length(p_slug)>180 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then raise exception 'Choose a valid vacancy reference.';end if;
 select count(*) into total from public.recruitment_vacancies v
 join public.recruitment_vacancy_versions x on x.id=v.published_version_id and x.vacancy_id=v.id
 join public.recruitment_vacancy_approvals a on a.version_id=x.id and a.vacancy_id=v.id
 where v.status='published' and (p_slug is null or v.slug=p_slug) and (p_category='' or x.category=p_category);
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'reference',q.reference,'slug',q.slug,'content',q.content,'version',q.number,'publishedAt',q.published_at,
 'availability',case when (q.content->>'closesAt')::timestamptz<=now() then 'closed' when (q.content->>'opensAt')::timestamptz>now() then 'opening_soon' else 'open' end,'acceptingApplications',false) order by q.published_at desc,q.id),'[]') into items
 from(select v.id,v.reference,v.slug,x.content,x.number,v.published_at from public.recruitment_vacancies v
 join public.recruitment_vacancy_versions x on x.id=v.published_version_id and x.vacancy_id=v.id
 join public.recruitment_vacancy_approvals a on a.version_id=x.id and a.vacancy_id=v.id
 where v.status='published' and (p_slug is null or v.slug=p_slug) and (p_category='' or x.category=p_category)
 order by v.published_at desc,v.id limit case when p_slug is null then 20 else 1 end offset case when p_slug is null then p_offset else 0 end)q;
 return jsonb_build_object('enabled',true,'generation',cfg.public_vacancies_generation,'vacancies',items,'total',total,'nextOffset',case when p_slug is null and total>p_offset+20 then p_offset+20 else null end);
end$$;

create or replace function public.recruitment_authorize(p_actor uuid,p_operation text,p_data jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff; target uuid; scope uuid; allowed text[];begin
 if left(p_operation,8)='vacancy_' then perform public.recruitment_vacancy_authorize(p_actor,p_operation,p_data);return;end if;
 s=public.recruitment_assert(p_actor);
 if p_operation not in ('staff_grant','scope_create','scope_grant','settings') then raise exception 'This recruitment operation has not been released.';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or nullif(p_data->>'requestId','') is null then raise exception 'Choose a stable request and valid details.';end if;
 allowed=case p_operation when 'staff_grant' then array['requestId','userId','role','enabled','expectedRevision'] when 'scope_grant' then array['requestId','userId','scopeId','enabled','expectedRevision'] when 'scope_create' then array['requestId','kind','label'] else array['requestId','expectedRevision','staffConsoleEnabled','accessGuardsEnabled','privacyPolicyVersion'] end;
 if not (p_data ?& allowed) or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(allowed))) then raise exception 'Only the released security fields are accepted.';end if;
 if p_operation in ('staff_grant','scope_grant') and (jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or (p_data->>'expectedRevision')::integer < -1) then raise exception 'Choose a state and expected revision.';end if;
 if p_operation='settings' and (jsonb_typeof(p_data->'staffConsoleEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'accessGuardsEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or jsonb_typeof(p_data->'privacyPolicyVersion') is distinct from 'string') then raise exception 'Choose valid rollout controls.';end if;
 if p_operation='settings' and (p_data->>'staffConsoleEnabled')::boolean and not (p_data->>'accessGuardsEnabled')::boolean then raise exception 'Enable the access safeguards before enabling the staff console.';end if;
 if p_operation<>'scope_grant' then perform public.recruitment_assert(p_actor,true);
 else
  target=(p_data->>'userId')::uuid;scope=(p_data->>'scopeId')::uuid;
  if not exists(select 1 from public.recruitment_staff where user_id=target) or not exists(select 1 from public.recruitment_scopes where id=scope) then raise exception 'Choose an existing recruitment staff identity and scope.';end if;
  if s.role<>'owner' and (s.role<>'manager' or not exists(select 1 from public.recruitment_staff_scopes where user_id=p_actor and scope_id=scope and enabled) or not exists(select 1 from public.recruitment_staff where user_id=target and role='officer' and enabled) or not exists(select 1 from public.recruitment_staff_scopes where user_id=target and scope_id=scope)) then raise exception 'Scope delegation is not permitted.';end if;
 end if;
 if p_operation in ('staff_grant','scope_grant') and (p_data->>'userId')::uuid=p_actor then raise exception 'You cannot change your own recruitment grants.';end if;
end$$;

create or replace function public.recruitment_mutate(p_actor uuid,p_operation text,p_data jsonb,p_session_hash text,p_proof_hash text,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.recruitment_settings; prior public.recruitment_requests; staff public.recruitment_staff;
 rid uuid=(p_data->>'requestId')::uuid; target uuid; scope uuid; rev integer; result jsonb; before_row jsonb;
begin
 if left(p_operation,8)='vacancy_' then return public.recruitment_vacancy_mutate(p_actor,p_operation,p_data,p_session_hash,p_proof_hash,p_aal);end if;
 select * into cfg from public.recruitment_settings where singleton for update;
 perform public.recruitment_authorize(p_actor,p_operation,p_data);
 perform public.recruitment_require_assurance(p_actor,p_aal);
 if rid is null then raise exception 'A stable request ID is required.';end if;
 select * into prior from public.recruitment_requests where id=rid;
 if prior.id is not null then
  if prior.actor_id<>p_actor or prior.operation<>p_operation or prior.payload<>p_data then raise exception 'Request ID conflicts with an earlier operation.';end if;
  return prior.result;
 end if;
 update public.recruitment_reauth_challenges set consumed_at=now()
 where secret_hash=p_proof_hash and actor_id=p_actor and session_hash=p_session_hash and operation=p_operation and payload=p_data and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'Fresh action-specific authentication is required.';end if;
 if p_operation='staff_grant' then
  target=(p_data->>'userId')::uuid;
  select * into staff from public.recruitment_staff where user_id=target;
  -- Verification gates additions/elevation, never removal of existing authority.
  if (staff.user_id is null or ((p_data->>'enabled')::boolean and (not staff.enabled or
      (case p_data->>'role' when 'owner' then 3 when 'manager' then 2 else 1 end) >
      (case staff.role when 'owner' then 3 when 'manager' then 2 else 1 end))))
      and not exists(select 1 from auth.users where id=target and email_confirmed_at is not null)
  then raise exception 'Choose an existing verified Auth identity for new or increased access.';end if;
  if coalesce(staff.revision,-1)<>(p_data->>'expectedRevision')::integer then raise exception 'Staff permissions changed. Refresh and review again.';end if;
  if staff.role='owner' and staff.enabled and (p_data->>'role'<>'owner' or not (p_data->>'enabled')::boolean) and (select count(*) from public.recruitment_staff where role='owner' and enabled)<=1 then raise exception 'Keep at least one enabled recruitment owner.';end if;
  before_row=jsonb_build_object('role',staff.role,'enabled',staff.enabled,'revision',staff.revision);
  insert into public.recruitment_staff(user_id,role,enabled,granted_by) values(target,p_data->>'role',(p_data->>'enabled')::boolean,p_actor)
  on conflict(user_id) do update set role=excluded.role,enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_staff.revision+1,updated_at=now();
  result=jsonb_build_object('userId',target);
 elsif p_operation='scope_create' then
  if p_data->>'kind'='talent_pool' and exists(select 1 from public.recruitment_scopes where kind='talent_pool') then raise exception 'The talent-pool scope already exists. Choose the existing scope.';end if;
  insert into public.recruitment_scopes(kind,label) values(p_data->>'kind',trim(p_data->>'label')) returning id into scope;
  result=jsonb_build_object('scopeId',scope);
 elsif p_operation='scope_grant' then
  target=(p_data->>'userId')::uuid;scope=(p_data->>'scopeId')::uuid;
  select revision,to_jsonb(g) into rev,before_row from public.recruitment_staff_scopes g where user_id=target and scope_id=scope;
  if (p_data->>'enabled')::boolean and not coalesce((before_row->>'enabled')::boolean,false)
  and not exists(select 1 from auth.users where id=target and email_confirmed_at is not null)
  then raise exception 'Choose an existing verified Auth identity for new or increased scope access.';end if;
  if coalesce(rev,-1)<>(p_data->>'expectedRevision')::integer then raise exception 'Scope permissions changed. Refresh and review again.';end if;
  insert into public.recruitment_staff_scopes(user_id,scope_id,enabled,granted_by) values(target,scope,(p_data->>'enabled')::boolean,p_actor)
  on conflict(user_id,scope_id) do update set enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_staff_scopes.revision+1;
  result=jsonb_build_object('userId',target,'scopeId',scope);
 elsif p_operation='settings' then
  if cfg.access_guards_mandatory and not (p_data->>'accessGuardsEnabled')::boolean then
   raise exception 'Mandatory access safeguards require separately approved operational intervention.';
  end if;
  if cfg.revision<>(p_data->>'expectedRevision')::integer then raise exception 'Recruitment settings changed. Refresh and review again.';end if;
  before_row=to_jsonb(cfg)-'bootstrapped_at';
  update public.recruitment_settings set staff_console_enabled=(p_data->>'staffConsoleEnabled')::boolean,access_guards_enabled=(p_data->>'accessGuardsEnabled')::boolean,privacy_policy_version=trim(p_data->>'privacyPolicyVersion'),revision=revision+1 where singleton;
  result=jsonb_build_object('saved',true);
 end if;
 insert into public.recruitment_events(actor_id,action,target_id,request_id,details) values(p_actor,p_operation,coalesce(target,scope),rid,jsonb_build_object('before',before_row,'choices',p_data-'requestId','authority','recruitment_staff'));
 insert into public.recruitment_requests(id,actor_id,operation,payload,result) values(rid,p_actor,p_operation,p_data,result);
 return result;
end$$;

create or replace function public.recruitment_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;begin
 s=public.recruitment_assert(p_actor);
 return jsonb_build_object('user',public.recruitment_context(p_actor),'settings',(select to_jsonb(c)-'bootstrapped_at' from public.recruitment_settings c where singleton),
 'features',jsonb_build_object('publicVacancies',(select public_vacancies_enabled from public.recruitment_settings where singleton),'talentPool',false,'applications',false,'uploads',false,'emailDispatch',false,'interviews',false,'decisions',false,'onboarding',false,'activation',false,'compensation',false),
 'staff',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('email',u.email) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id) when s.role='manager' then (select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'email',u.email,'role',r.role,'enabled',r.enabled) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id where r.role='officer' and r.enabled and exists(
   select 1 from public.recruitment_staff_scopes mg join public.recruitment_staff_scopes og on og.scope_id=mg.scope_id
   where mg.user_id=p_actor and mg.enabled and og.user_id=r.user_id )) else '[]'::jsonb end,
 'scopes',(select coalesce(jsonb_agg(to_jsonb(c) order by label),'[]') from public.recruitment_scopes c where s.role='owner' or exists(select 1 from public.recruitment_staff_scopes g where g.scope_id=c.id and g.user_id=p_actor and g.enabled)),
 'grants',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from public.recruitment_staff_scopes g where s.role='owner' or g.user_id=p_actor or (s.role='manager' and exists(select 1 from public.recruitment_staff_scopes own where own.user_id=p_actor and own.scope_id=g.scope_id and own.enabled))),
 'events',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]') from(select * from public.recruitment_events order by created_at desc,id limit 200)e) else '[]'::jsonb end);
end$$;

revoke all on function public.recruitment_vacancy_content_valid(jsonb,boolean),public.recruitment_vacancy_visible(uuid,uuid),public.recruitment_vacancy_authorize(uuid,text,jsonb),public.recruitment_vacancy_mutate(uuid,text,jsonb,text,text,text),public.recruitment_vacancy_workspace(uuid,uuid,integer,integer,text,text,text),public.recruitment_public_vacancies(text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_vacancy_workspace(uuid,uuid,integer,integer,text,text,text),public.recruitment_public_vacancies(text,integer,text) to service_role;
notify pgrst,'reload schema';

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261109050000_recruitment_vacancies.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261111010000_recruitment_intake_foundation.sql
-- SHA256 77acdaff19f4a621a7e077b61d4f5e419ba9d35dc622d9fea5ae5d021233d795
-- M3.1 only: additive, dormant case foundations. NO applicant endpoints or activation.
-- Production execution requires target inventory and separate exact-SQL approval.
alter table public.recruitment_settings
 add column if not exists vacancy_intake_enabled boolean not null default false,
 add column if not exists talent_pool_intake_enabled boolean not null default false,
 add column if not exists applicant_email_enabled boolean not null default false,
 add column if not exists document_uploads_enabled boolean not null default false,
 add column if not exists case_processing_enabled boolean not null default false,
 add column if not exists review_months integer not null default 12 check(review_months=12),
 add column if not exists withdrawn_days integer not null default 30 check(withdrawn_days=30),
 add column if not exists intake_privacy_notice_version text,
 add column if not exists intake_policy_approval_ref text,
 add column if not exists intake_policy_approved_at timestamptz,
 add column if not exists case_evidence_days integer check(case_evidence_days between 1 and 3650);
-- A future reviewed migration must replace this interlock after phase acceptance.
-- Ordinary M1/M2 settings operations cannot enable applicant functionality.
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.recruitment_settings'::regclass and conname='recruitment_m31_intake_interlock') then
  alter table public.recruitment_settings add constraint recruitment_m31_intake_interlock
   check(not(vacancy_intake_enabled or talent_pool_intake_enabled or applicant_email_enabled or document_uploads_enabled or case_processing_enabled));
 end if;
end$$;

create or replace function public.recruitment_intake_field(k text,t text default 'text',r boolean default true,m integer default 2000,o jsonb default '[]') returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('key',k,'type',t,'required',r,'maxLength',m,'options',o)
$$;

create or replace function public.recruitment_intake_definition(p_purpose text,p_category text,p_content jsonb default null) returns jsonb
language plpgsql immutable set search_path='' as $$
declare f jsonb;begin
 if p_purpose is null or p_purpose not in ('vacancy','talent_pool')
 or (p_purpose='vacancy' and (p_category is null or p_category not in ('tutor','administrator','support_staff') or p_content is null or p_content->>'category' is distinct from p_category or not public.recruitment_vacancy_content_valid(p_content,true)))
 or (p_purpose='talent_pool' and (p_category is not null or p_content is not null)) then
  raise exception using errcode='22023',message='intake_purpose_mismatch';end if;
 if p_content is not null and jsonb_array_length(p_content->'requiredDocuments')>8 then
  raise exception using errcode='22023',message='incompatible_document_requirements';end if;
 f=jsonb_build_array(
  public.recruitment_intake_field('firstName','text',true,100),
  public.recruitment_intake_field('lastName','text',true,100),
  public.recruitment_intake_field('phone','text',false,40),
  public.recruitment_intake_field('location','text',true,160),
  public.recruitment_intake_field('availability'),
  public.recruitment_intake_field('adultConfirmed','boolean',true,null),
  public.recruitment_intake_field('privacyAcknowledged','boolean',true,null));
 if p_category='tutor' then f=f||jsonb_build_array(
  public.recruitment_intake_field('subjects','multi_select',true,null,p_content->'subjects'),
  public.recruitment_intake_field('grades','multi_select',true,null,p_content->'grades'),
  public.recruitment_intake_field('qualifications'),
  public.recruitment_intake_field('teachingExperience','text',true,4000));
 elsif p_category='administrator' then f=f||jsonb_build_array(
  public.recruitment_intake_field('administrativeExperience','text',true,4000),public.recruitment_intake_field('administrativeSkills'));
 elsif p_category='support_staff' then f=f||jsonb_build_array(
  public.recruitment_intake_field('supportExperience','text',true,4000),public.recruitment_intake_field('supportSkills'));
 else f=f||jsonb_build_array(
  public.recruitment_intake_field('categoryInterests','multi_select',true,null,'["tutor","administrator","support_staff"]'),
  public.recruitment_intake_field('engagementInterests','multi_select',true,null,'["employee","independent_contractor","volunteer"]'),
  public.recruitment_intake_field('experience','text',true,4000),public.recruitment_intake_field('skills'));
 end if;
 return jsonb_build_object('templateVersion','m3.1-v1','purpose',p_purpose,'category',p_category,'fields',f,
  'questions',coalesce(p_content->'questions','[]'), 'requiredDocuments',coalesce(p_content->'requiredDocuments','[]'),
  'documentPolicy',jsonb_build_object('mimeTypes',jsonb_build_array('application/pdf'),'maxFileBytes',10485760,'maxFiles',8,'maxCaseBytes',41943040,'cleanRequired',true));
end$$;

create table if not exists public.recruitment_intake_forms (
 id uuid primary key default gen_random_uuid(), purpose text not null check(purpose in ('vacancy','talent_pool')),
 scope_id uuid not null references public.recruitment_scopes(id),
 vacancy_id uuid, version_id uuid, category text,
 template_version text not null default 'm3.1-v1' check(template_version='m3.1-v1'),
 definition jsonb not null check(jsonb_typeof(definition)='object' and octet_length(definition::text)<=32768),
 definition_hash text not null check(definition_hash ~ '^[0-9a-f]{64}$'),
 privacy_notice_version text not null check(privacy_notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
 document_policy_version text not null check(document_policy_version='pdf-v1'),
 approved_by uuid not null references public.recruitment_staff(user_id), approved_at timestamptz not null default clock_timestamp(),
 foreign key(vacancy_id,version_id) references public.recruitment_vacancy_approvals(vacancy_id,version_id),
 unique(id,purpose,scope_id), unique(id,vacancy_id,version_id),
 check((purpose='vacancy' and vacancy_id is not null and version_id is not null and category is not null and category in ('tutor','administrator','support_staff'))
    or (purpose='talent_pool' and vacancy_id is null and version_id is null and category is null))
);
create index if not exists recruitment_form_version_idx on public.recruitment_intake_forms(vacancy_id,version_id);
create table if not exists public.recruitment_intake_form_bindings (
 id uuid primary key default gen_random_uuid(), form_id uuid not null unique references public.recruitment_intake_forms(id),
 purpose text not null check(purpose in ('vacancy','talent_pool')), scope_id uuid not null references public.recruitment_scopes(id),
 vacancy_id uuid, version_id uuid, enabled boolean not null default false,
 revision integer not null default 0 check(revision>=0), updated_by uuid not null references public.recruitment_staff(user_id),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(form_id,purpose,scope_id) references public.recruitment_intake_forms(id,purpose,scope_id),
 foreign key(form_id,vacancy_id,version_id) references public.recruitment_intake_forms(id,vacancy_id,version_id),
 check((purpose='vacancy' and vacancy_id is not null and version_id is not null) or (purpose='talent_pool' and vacancy_id is null and version_id is null))
);
create unique index if not exists recruitment_binding_active_version on public.recruitment_intake_form_bindings(vacancy_id,version_id) where enabled and purpose='vacancy';
create unique index if not exists recruitment_binding_active_pool on public.recruitment_intake_form_bindings(scope_id) where enabled and purpose='talent_pool';

create or replace function public.recruitment_guard_intake_form() returns trigger
language plpgsql security definer set search_path='' as $$
declare c jsonb;begin
 if tg_table_name='recruitment_intake_forms' then
  perform public.recruitment_assert(new.approved_by,true);
  if not exists(select 1 from public.recruitment_scopes where id=new.scope_id and kind=new.purpose) then raise exception 'intake_scope_mismatch';end if;
  if new.purpose='vacancy' then
   select vv.content into c from public.recruitment_vacancy_versions vv join public.recruitment_vacancies v on v.id=vv.vacancy_id
    where vv.id=new.version_id and v.id=new.vacancy_id and v.scope_id=new.scope_id;
   if c is null then raise exception 'intake_version_mismatch';end if;
  end if;
  if new.definition is distinct from public.recruitment_intake_definition(new.purpose,new.category,c) then raise exception 'intake_definition_mismatch';end if;
  new.definition_hash=encode(sha256(convert_to(new.definition::text,'UTF8')),'hex');
 else
  perform public.recruitment_assert(new.updated_by,true);
  if tg_op='UPDATE' and (new.form_id,new.purpose,new.scope_id,new.vacancy_id,new.version_id) is distinct from (old.form_id,old.purpose,old.scope_id,old.vacancy_id,old.version_id) then raise exception 'intake_binding_immutable';end if;
  if new.enabled and new.purpose='vacancy' and not exists(select 1 from public.recruitment_vacancies where id=new.vacancy_id and published_version_id=new.version_id and status='published') then raise exception 'intake_publication_required';end if;
 end if;
 return new;
end$$;
drop trigger if exists recruitment_form_guard on public.recruitment_intake_forms;
create trigger recruitment_form_guard before insert on public.recruitment_intake_forms for each row execute function public.recruitment_guard_intake_form();
drop trigger if exists recruitment_immutable on public.recruitment_intake_forms;
create trigger recruitment_immutable before update or delete on public.recruitment_intake_forms for each row execute function public.recruitment_immutable();
drop trigger if exists recruitment_binding_guard on public.recruitment_intake_form_bindings;
create trigger recruitment_binding_guard before insert or update on public.recruitment_intake_form_bindings for each row execute function public.recruitment_guard_intake_form();

-- These supporting unique indexes permit exact composite FKs without modifying M2 history.
create unique index if not exists recruitment_publication_identity on public.recruitment_vacancy_publications(vacancy_id,version_id,id);
create table if not exists public.recruitment_cases (
 id uuid primary key default gen_random_uuid(), reference uuid not null unique default gen_random_uuid(),
 kind text not null check(kind in ('vacancy','talent_pool')), scope_id uuid not null references public.recruitment_scopes(id),
 vacancy_id uuid, version_id uuid, publication_id uuid, form_id uuid not null references public.recruitment_intake_forms(id),
 state text not null default 'draft' check(state in ('draft','submitted','under_review','recommendation_recorded','withdrawn','expired','deletion_pending','purged')),
 revision integer not null default 0 check(revision>=0), created_at timestamptz not null default clock_timestamp(),
 last_activity_at timestamptz not null default clock_timestamp(), submitted_at timestamptz, withdrawn_at timestamptz,
 unsuccessful_closed_at timestamptz check(unsuccessful_closed_at is null), -- Reserved; no final decisions in M3.
 pool_consented_at timestamptz, retention_due_at timestamptz not null,
 retention_extended_until timestamptz, extension_authorized_by uuid references public.recruitment_staff(user_id), extension_approval_ref text,
 deletion_barrier_at timestamptz, purged_at timestamptz,
 unique(id,kind,scope_id), unique(id,form_id),
 foreign key(form_id,kind,scope_id) references public.recruitment_intake_forms(id,purpose,scope_id),
 foreign key(form_id,vacancy_id,version_id) references public.recruitment_intake_forms(id,vacancy_id,version_id),
 foreign key(vacancy_id,version_id,publication_id) references public.recruitment_vacancy_publications(vacancy_id,version_id,id),
 check((kind='vacancy' and vacancy_id is not null and version_id is not null and publication_id is not null and pool_consented_at is null)
    or (kind='talent_pool' and vacancy_id is null and version_id is null and publication_id is null)),
 check(state not in ('submitted','under_review','recommendation_recorded') or submitted_at is not null),
 check(state<>'draft' or (submitted_at is null and withdrawn_at is null and pool_consented_at is null)),
 check(kind<>'talent_pool' or state not in ('submitted','under_review','recommendation_recorded') or pool_consented_at is not null),
 check(state<>'withdrawn' or withdrawn_at is not null),
 check(state<>'purged' or (purged_at is not null and deletion_barrier_at is not null)),
 check(deletion_barrier_at is null or state in ('deletion_pending','purged')),
 check(purged_at is null or state='purged'),
 check((retention_extended_until is null and extension_authorized_by is null and extension_approval_ref is null)
    or (retention_extended_until is not null and isfinite(retention_extended_until) and extension_authorized_by is not null and extension_approval_ref is not null and extension_approval_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$')),
 check(isfinite(retention_due_at) and isfinite(created_at) and isfinite(last_activity_at))
);
create index if not exists recruitment_case_queue_idx on public.recruitment_cases(scope_id,submitted_at,id) where submitted_at is not null;
create index if not exists recruitment_case_retention_idx on public.recruitment_cases(retention_due_at,id) where state<>'purged';

create table if not exists public.recruitment_case_contacts (
 case_id uuid primary key, kind text not null, scope_id uuid not null, vacancy_id uuid,
 normalized_email text not null check(normalized_email=lower(btrim(normalized_email)) and length(normalized_email) between 3 and 254 and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
 email_hmac text not null check(email_hmac ~ '^[0-9a-f]{64}$'), key_version integer not null check(key_version>0),
 email_revision integer not null default 1 check(email_revision>0), verified_at timestamptz not null,
 active boolean not null default true,
 reapplication_authorized_by uuid references public.recruitment_staff(user_id), reapplication_approval_ref text,
 foreign key(case_id,kind,scope_id) references public.recruitment_cases(id,kind,scope_id) on delete cascade,
 check((kind='vacancy' and vacancy_id is not null) or (kind='talent_pool' and vacancy_id is null)),
 check((reapplication_authorized_by is null and reapplication_approval_ref is null) or
  (reapplication_authorized_by is not null and reapplication_approval_ref is not null and reapplication_approval_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$'))
);
-- Normalized email is already protected PII. Uniqueness is independent of HMAC rotation.
create unique index if not exists recruitment_active_vacancy_email on public.recruitment_case_contacts(vacancy_id,normalized_email) where active and kind='vacancy';
create unique index if not exists recruitment_active_pool_email on public.recruitment_case_contacts(scope_id,normalized_email) where active and kind='talent_pool';
create index if not exists recruitment_contact_lookup_idx on public.recruitment_case_contacts(kind,scope_id,key_version,email_hmac);
create index if not exists recruitment_contact_conflict_lookup on public.recruitment_case_contacts(normalized_email,case_id);

create or replace function public.recruitment_answers_valid(p_form uuid,a jsonb,p_complete boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare d jsonb;f jsonb;q jsonb;v jsonb;k text;begin
 select definition into d from public.recruitment_intake_forms where id=p_form;
 if d is null or jsonb_typeof(a) is distinct from 'object' or octet_length(a::text)>65536 or not(a ?& array['fields','questions'])
 or exists(select 1 from jsonb_object_keys(a) x where x not in ('fields','questions'))
 or jsonb_typeof(a->'fields') is distinct from 'object' or jsonb_typeof(a->'questions') is distinct from 'object' then return false;end if;
 if exists(select 1 from jsonb_object_keys(a->'fields') x where not exists(select 1 from jsonb_array_elements(d->'fields') z where z->>'key'=x))
 or exists(select 1 from jsonb_object_keys(a->'questions') x where not exists(select 1 from jsonb_array_elements(d->'questions') z where z->>'key'=x)) then return false;end if;
 for f in select value from jsonb_array_elements(d->'fields') loop
  k=f->>'key';v=a->'fields'->k;
  if v is null then if p_complete and (f->>'required')::boolean then return false;end if;continue;end if;
  if f->>'type'='text' then
   if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>(f->>'maxLength')::integer or (p_complete and (f->>'required')::boolean and length(btrim(v#>>'{}'))=0) then return false;end if;
  elsif f->>'type'='boolean' then
   if jsonb_typeof(v) is distinct from 'boolean' or (p_complete and v<>'true'::jsonb) then return false;end if;
  else
   if jsonb_typeof(v) is distinct from 'array' then return false;end if;
   if jsonb_array_length(v)>(select jsonb_array_length(f->'options')) or (p_complete and (f->>'required')::boolean and jsonb_array_length(v)=0)
   or (select count(*)<>count(distinct value) from jsonb_array_elements(v))
   or exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) is distinct from 'string' or not((f->'options') @> jsonb_build_array(x))) then return false;end if;
  end if;
 end loop;
 for q in select value from jsonb_array_elements(d->'questions') loop
  v=a->'questions'->(q->>'key');
  if v is null then if p_complete and (q->>'required')::boolean then return false;end if;continue;end if;
  if q->>'type'='text' and (jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>4000 or (p_complete and (q->>'required')::boolean and length(btrim(v#>>'{}'))=0)) then return false;end if;
  if q->>'type'='yes_no' and jsonb_typeof(v) is distinct from 'boolean' then return false;end if;
  if q->>'type'='number' and (jsonb_typeof(v) is distinct from 'number' or abs((v#>>'{}')::numeric)>1.7976931348623157e308) then return false;end if;
 end loop;
 return true;
exception when others then return false;
end$$;
create table if not exists public.recruitment_case_payloads (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 form_id uuid not null references public.recruitment_intake_forms(id), revision integer not null check(revision>=0),
 kind text not null check(kind in ('draft','submitted','correction')), answers jsonb not null,
 sealed_at timestamptz, created_at timestamptz not null default clock_timestamp(),
 unique(case_id,revision), unique(case_id,id),
 check((kind='draft' and sealed_at is null) or (kind in ('submitted','correction') and sealed_at is not null)),
 check(public.recruitment_answers_valid(form_id,answers,kind<>'draft'))
);

create table if not exists public.recruitment_case_assignments (
 case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 user_id uuid not null references public.recruitment_staff(user_id), enabled boolean not null default false,
 revision integer not null default 0 check(revision>=0), granted_by uuid not null references public.recruitment_staff(user_id),
 updated_at timestamptz not null default clock_timestamp(), primary key(case_id,user_id), check(user_id<>granted_by)
);
create index if not exists recruitment_case_assignment_idx on public.recruitment_case_assignments(user_id,case_id) where enabled;
create table if not exists public.recruitment_case_conflicts (
 case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 user_id uuid not null references public.recruitment_staff(user_id),
 source text not null check(source in ('verified_email','declared','independent_review')),
 declared_by uuid references public.recruitment_staff(user_id), created_at timestamptz not null default clock_timestamp(),
 resolved_by uuid references public.recruitment_staff(user_id), resolved_at timestamptz, resolution_ref text,
 primary key(case_id,user_id), check(resolved_by is null or resolved_by<>user_id),
 check(source='verified_email' or declared_by is not null),
 check((resolved_at is null and resolved_by is null and resolution_ref is null)
 or (resolved_at is not null and resolved_by is not null and resolution_ref is not null and resolution_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$'))
);
create index if not exists recruitment_case_conflict_idx on public.recruitment_case_conflicts(user_id,case_id) where resolved_at is null;

create table if not exists public.recruitment_consent_events (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 purpose text not null check(purpose in ('vacancy_notice','talent_pool')),
 action text not null check(action in ('acknowledge','affirm','renew','withdraw')),
 notice_version text not null check(notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
 email_revision integer not null check(email_revision>0), recorded_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz, evidence_expires_at timestamptz not null check(isfinite(evidence_expires_at)),
 check((purpose='vacancy_notice' and action='acknowledge' and expires_at is null)
 or (purpose='talent_pool' and action in ('affirm','renew') and expires_at is not null)
 or (purpose='talent_pool' and action='withdraw' and expires_at is null))
);
create index if not exists recruitment_consent_case_idx on public.recruitment_consent_events(case_id,recorded_at,id);
create table if not exists public.recruitment_case_audit (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 actor_kind text not null check(actor_kind in ('applicant','staff','worker')), actor_id uuid,
 action text not null check(action in ('case_created','draft_saved','form_rebased','submitted','withdrawn','expired','assignment_changed','conflict_recorded','conflict_resolved','retention_extended','reapplication_authorized','hold_placed','hold_released','deletion_requested','deletion_barrier','purged','recommendation_recorded')),
 request_id uuid, revision integer not null check(revision>=0), payload_digest text check(payload_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null check(isfinite(expires_at)),
 check((actor_kind='applicant' and actor_id is not null and actor_id=case_id) or (actor_kind='staff' and actor_id is not null) or (actor_kind='worker' and actor_id is null))
);
create index if not exists recruitment_case_audit_idx on public.recruitment_case_audit(case_id,created_at,id);
create index if not exists recruitment_case_audit_expiry on public.recruitment_case_audit(expires_at);
create table if not exists public.recruitment_privacy_holds (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_cases(id) on delete restrict,
 purpose text not null check(purpose in ('vacancy','talent_pool')),
 reason_code text not null check(reason_code in ('legal_obligation','dispute','rights_request')),
 evidence_ref text not null check(evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$'),
 placed_by uuid not null references public.recruitment_staff(user_id), placed_at timestamptz not null default clock_timestamp(),
 review_at timestamptz not null, released_by uuid references public.recruitment_staff(user_id), released_at timestamptz,
 check(review_at>placed_at and isfinite(review_at)), check((released_by is null)=(released_at is null))
);
create index if not exists recruitment_active_hold_idx on public.recruitment_privacy_holds(case_id,review_at) where released_at is null;

create table if not exists public.recruitment_case_requests (
 case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 actor_kind text not null check(actor_kind in ('applicant','staff')), actor_id uuid not null,
 request_id uuid not null, operation text not null check(operation in ('save','rebase','submit','withdraw','request_deletion','rotate_session','reserve','finalize','discard','assign','note','clarify','recommend','hold','extend_retention','resolve_conflict')),
 payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
 state text not null check(state in ('pending','committed')), result_ref uuid,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null check(isfinite(expires_at)),
 primary key(case_id,actor_kind,actor_id,request_id), check(actor_kind<>'applicant' or actor_id=case_id),
 check(state<>'committed' or result_ref is not null)
);
create index if not exists recruitment_case_request_expiry on public.recruitment_case_requests(expires_at);
create table if not exists public.recruitment_staff_change_buffers (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 actor_id uuid not null references public.recruitment_staff(user_id), session_hash text not null check(session_hash ~ '^[0-9a-f]{64}$'),
 operation text not null check(operation in ('note','clarify','recommend')),
 expected_revision integer not null check(expected_revision>=0), payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=8192),
 payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null, consumed_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '5 minutes')
);
create index if not exists recruitment_change_buffer_expiry on public.recruitment_staff_change_buffers(expires_at);
create table if not exists public.recruitment_case_challenges (
 secret_hash text primary key check(secret_hash ~ '^[0-9a-f]{64}$'), case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 actor_id uuid not null references public.recruitment_staff(user_id), session_hash text not null check(session_hash ~ '^[0-9a-f]{64}$'),
 request_id uuid not null, operation text not null check(operation in ('assign','note','clarify','recommend','hold','extend_retention','resolve_conflict')),
 expected_revision integer not null check(expected_revision>=0), change_id uuid references public.recruitment_staff_change_buffers(id) on delete cascade,
 payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null, consumed_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '5 minutes'),
 check(operation not in ('note','clarify','recommend') or change_id is not null)
);
create index if not exists recruitment_case_challenge_expiry on public.recruitment_case_challenges(expires_at);

-- No service or browser grants ship in M3.1. Later narrow RPCs must establish a
-- verified applicant capability or validated staff session BEFORE calling these helpers.
create or replace function public.recruitment_case_conflicted(p_actor uuid,p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_case_conflicts where case_id=p_case and user_id=p_actor and resolved_at is null)
 or exists(select 1 from public.recruitment_case_contacts c join auth.users u on u.id=p_actor
  where c.case_id=p_case and u.email_confirmed_at is not null and c.normalized_email=lower(btrim(u.email)))
$$;
create or replace function public.recruitment_case_staff_allowed(p_actor uuid,p_case uuid,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;c public.recruitment_cases;begin
 if p_action is null or p_action not in ('read','document','review','assign','hold','extend_retention','resolve_conflict') then return false;end if;
 select r.* into s from public.recruitment_staff r join auth.users u on u.id=r.user_id
 where r.user_id=p_actor and r.enabled and u.email_confirmed_at is not null;
 select * into c from public.recruitment_cases where id=p_case;
 if s.user_id is null or c.id is null or c.state='purged'
 or (c.state='deletion_pending' and (p_action<>'hold' or c.deletion_barrier_at is not null))
 or public.recruitment_case_conflicted(p_actor,p_case) then return false;end if;
 if s.role='owner' then return true;end if;
 if p_action in ('hold','extend_retention','resolve_conflict') or not exists(select 1 from public.recruitment_settings where singleton and staff_console_enabled)
 or not exists(select 1 from public.recruitment_staff_scopes where user_id=p_actor and scope_id=c.scope_id and enabled)
 or not exists(select 1 from public.recruitment_case_assignments where case_id=p_case and user_id=p_actor and enabled) then return false;end if;
 return s.role='manager' or p_action in ('read','document','review');
end$$;

-- Calendar months use the approved South African civil-time policy; real workers
-- must compare clock_timestamp() AFTER locking. This pure helper never changes state.
create or replace function public.recruitment_retention_deadline(p_kind text,p_activity timestamptz,p_submitted timestamptz default null,p_withdrawn timestamptz default null,p_unsuccessful timestamptz default null,p_consent timestamptz default null,p_extension timestamptz default null) returns timestamptz
language plpgsql immutable set search_path='' as $$
declare due timestamptz;begin
 if p_kind is null or p_kind not in ('vacancy','talent_pool') or p_activity is null then raise exception 'invalid_retention_basis';end if;
 if p_withdrawn is not null then due=p_withdrawn+interval '720 hours';
 elsif p_unsuccessful is not null then due=((p_unsuccessful at time zone 'Africa/Johannesburg')+interval '6 months') at time zone 'Africa/Johannesburg';
 elsif p_kind='talent_pool' and p_consent is not null then due=((p_consent at time zone 'Africa/Johannesburg')+interval '12 months') at time zone 'Africa/Johannesburg';
 elsif p_submitted is not null then due=((p_submitted at time zone 'Africa/Johannesburg')+interval '12 months') at time zone 'Africa/Johannesburg';
 else due=p_activity+interval '336 hours';end if;
 -- Withdrawal/final closure supersede an earlier review extension; retaining its
 -- approval metadata must never prevent withdrawal or extend the 30-day clock.
 if p_extension is not null and p_withdrawn is null and p_unsuccessful is null then
  if p_kind<>'vacancy' or p_submitted is null or not isfinite(p_extension) or p_extension<=due then raise exception 'invalid_retention_extension';end if;
  due=p_extension;
 end if;
 if not isfinite(due) then raise exception 'invalid_retention_basis';end if;
 return due;
end$$;

create or replace function public.recruitment_guard_case() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.recruitment_intake_forms;begin
 if new.unsuccessful_closed_at is not null then raise exception 'final_decisions_unavailable';end if;
 if tg_op='UPDATE' then
  if new.revision<>old.revision+1 then raise exception 'case_revision_conflict';end if;
  if (new.id,new.reference,new.kind,new.scope_id,new.vacancy_id,new.created_at) is distinct from (old.id,old.reference,old.kind,old.scope_id,old.vacancy_id,old.created_at) then raise exception 'case_identity_immutable';end if;
  if new.state is distinct from old.state and not(
   (old.state='draft' and new.state in ('submitted','withdrawn','expired','deletion_pending')) or
   (old.state='submitted' and new.state in ('under_review','withdrawn','deletion_pending')) or
   (old.state='under_review' and new.state in ('recommendation_recorded','withdrawn','deletion_pending')) or
   (old.state='recommendation_recorded' and new.state in ('under_review','withdrawn','deletion_pending')) or
   (old.state in ('withdrawn','expired') and new.state='deletion_pending') or
   (old.state='deletion_pending' and new.state='purged')) then raise exception 'case_transition_denied';end if;
  if old.submitted_at is not null and (new.submitted_at,new.form_id,new.version_id,new.publication_id) is distinct from (old.submitted_at,old.form_id,old.version_id,old.publication_id) then raise exception 'submitted_requirements_immutable';end if;
  if old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at then raise exception 'withdrawal_immutable';end if;
  if old.deletion_barrier_at is not null and new.deletion_barrier_at is distinct from old.deletion_barrier_at then raise exception 'deletion_barrier_immutable';end if;
 end if;
 if (new.deletion_barrier_at is not null or new.state='purged') and exists(select 1 from public.recruitment_privacy_holds where case_id=new.id and released_at is null) then raise exception 'active_privacy_hold';end if;
 if new.state='purged' and (exists(select 1 from public.recruitment_case_contacts where case_id=new.id)
  or exists(select 1 from public.recruitment_case_payloads where case_id=new.id)
  or exists(select 1 from public.recruitment_staff_change_buffers where case_id=new.id)
  or exists(select 1 from public.recruitment_case_challenges where case_id=new.id)
  or exists(select 1 from public.recruitment_case_requests where case_id=new.id)) then raise exception 'case_pii_not_erased';end if;
 select * into f from public.recruitment_intake_forms where id=new.form_id;
 if f.id is null or f.purpose<>new.kind or f.scope_id<>new.scope_id or (f.vacancy_id,f.version_id) is distinct from (new.vacancy_id,new.version_id) then raise exception 'case_form_mismatch';end if;
 if new.retention_extended_until is not null and (tg_op='INSERT' or (new.retention_extended_until,new.extension_authorized_by,new.extension_approval_ref) is distinct from (old.retention_extended_until,old.extension_authorized_by,old.extension_approval_ref)) then
  if new.withdrawn_at is not null or new.state not in ('submitted','under_review','recommendation_recorded') then raise exception 'invalid_retention_extension';end if;
  perform public.recruitment_assert(new.extension_authorized_by,true);
  if public.recruitment_case_conflicted(new.extension_authorized_by,new.id) then raise exception 'case_conflict';end if;
 end if;
 new.retention_due_at=public.recruitment_retention_deadline(new.kind,new.last_activity_at,new.submitted_at,new.withdrawn_at,new.unsuccessful_closed_at,new.pool_consented_at,new.retention_extended_until);
 return new;
end$$;
drop trigger if exists recruitment_case_guard on public.recruitment_cases;
create trigger recruitment_case_guard before insert or update on public.recruitment_cases for each row execute function public.recruitment_guard_case();

create or replace function public.recruitment_guard_case_contact() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;begin
 if tg_op='UPDATE' and new.case_id<>old.case_id then raise exception 'contact_identity_immutable';end if;
 select * into c from public.recruitment_cases where id=new.case_id for update;
 if c.id is null or (new.kind,new.scope_id,new.vacancy_id) is distinct from (c.kind,c.scope_id,c.vacancy_id) then raise exception 'case_contact_mismatch';end if;
 if tg_op='UPDATE' and new.normalized_email<>old.normalized_email and (new.email_revision<>old.email_revision+1 or new.verified_at<=old.verified_at) then raise exception 'new_email_verification_required';end if;
 if tg_op='UPDATE' and new.email_revision<old.email_revision then raise exception 'email_revision_rollback';end if;
 if new.reapplication_authorized_by is not null and (tg_op='INSERT' or
  (new.reapplication_authorized_by,new.reapplication_approval_ref,new.normalized_email) is distinct from (old.reapplication_authorized_by,old.reapplication_approval_ref,old.normalized_email)) then
  perform public.recruitment_assert(new.reapplication_authorized_by,true);
  if public.recruitment_case_conflicted(new.reapplication_authorized_by,c.id) or exists(select 1 from auth.users where id=new.reapplication_authorized_by and lower(btrim(email))=new.normalized_email) then raise exception 'independent_authority_required';end if;
 end if;
 if (tg_op='INSERT' or new.normalized_email is distinct from old.normalized_email) and exists(
  select 1 from public.recruitment_case_contacts x where x.case_id<>new.case_id and x.kind=new.kind
  and x.normalized_email=new.normalized_email and x.scope_id=new.scope_id
  and x.vacancy_id is not distinct from new.vacancy_id and not x.active)
 and new.reapplication_authorized_by is null then raise exception 'controlled_reapplication_required';end if;
 new.active=c.state not in ('withdrawn','expired','deletion_pending','purged');
 return new;
end$$;
drop trigger if exists recruitment_contact_guard on public.recruitment_case_contacts;
create trigger recruitment_contact_guard before insert or update on public.recruitment_case_contacts for each row execute function public.recruitment_guard_case_contact();
create or replace function public.recruitment_sync_case_contact() returns trigger
language plpgsql security definer set search_path='' as $$begin
 update public.recruitment_case_contacts set active=new.state not in ('withdrawn','expired','deletion_pending','purged') where case_id=new.id;
 return new;
end$$;
drop trigger if exists recruitment_contact_state on public.recruitment_cases;
create trigger recruitment_contact_state after update of state on public.recruitment_cases for each row execute function public.recruitment_sync_case_contact();

-- Capture matching identities once and keep the relationship when either email changes.
create or replace function public.recruitment_capture_case_conflicts() returns trigger
language plpgsql security definer set search_path='' as $$begin
 insert into public.recruitment_case_conflicts(case_id,user_id,source)
 select new.case_id,s.user_id,'verified_email' from public.recruitment_staff s join auth.users u on u.id=s.user_id
 where u.email_confirmed_at is not null and lower(btrim(u.email))=new.normalized_email
 on conflict(case_id,user_id) do update set resolved_by=null,resolved_at=null,resolution_ref=null;
 return new;
end$$;
drop trigger if exists recruitment_contact_conflict on public.recruitment_case_contacts;
create trigger recruitment_contact_conflict after insert or update of normalized_email on public.recruitment_case_contacts for each row execute function public.recruitment_capture_case_conflicts();
create or replace function public.recruitment_capture_staff_conflicts() returns trigger
language plpgsql security definer set search_path='' as $$
declare uid uuid;previous_email text;begin
 if tg_table_name='users' then uid=new.id;previous_email=lower(btrim(old.email));else uid=new.user_id;end if;
 if exists(select 1 from public.recruitment_staff where user_id=uid) then
  insert into public.recruitment_case_conflicts(case_id,user_id,source)
  select c.case_id,uid,'verified_email' from public.recruitment_case_contacts c join auth.users u on u.id=uid
   where u.email_confirmed_at is not null and (c.normalized_email=lower(btrim(u.email)) or c.normalized_email=previous_email)
  on conflict(case_id,user_id) do update set resolved_by=null,resolved_at=null,resolution_ref=null;
 end if;
 return new;
end$$;
drop trigger if exists recruitment_staff_case_conflict on public.recruitment_staff;
create trigger recruitment_staff_case_conflict after insert on public.recruitment_staff for each row execute function public.recruitment_capture_staff_conflicts();
drop trigger if exists recruitment_auth_case_conflict on auth.users;
create trigger recruitment_auth_case_conflict after update of email,email_confirmed_at on auth.users for each row execute function public.recruitment_capture_staff_conflicts();

create or replace function public.recruitment_guard_case_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;b public.recruitment_staff_change_buffers;begin
 select * into c from public.recruitment_cases where id=new.case_id for update;
 if c.id is null then raise exception 'case_unavailable';end if;
 if tg_table_name='recruitment_case_payloads' then
  if new.form_id<>c.form_id and new.kind='draft' then raise exception 'payload_form_mismatch';end if;
  if tg_op='UPDATE' and (old.kind<>'draft' or new.case_id<>old.case_id) then raise exception 'sealed_payload_immutable';end if;
  if new.kind<>'draft' and new.form_id<>c.form_id then raise exception 'payload_form_mismatch';end if;
 elsif tg_table_name='recruitment_case_assignments' then
  if tg_op='UPDATE' and (new.case_id,new.user_id) is distinct from (old.case_id,old.user_id) then raise exception 'assignment_identity_immutable';end if;
  if not public.recruitment_case_staff_allowed(new.granted_by,new.case_id,'assign') then raise exception 'case_access_denied';end if;
  if new.enabled and (public.recruitment_case_conflicted(new.user_id,new.case_id) or not exists(
   select 1 from public.recruitment_staff s join auth.users u on u.id=s.user_id join public.recruitment_staff_scopes g on g.user_id=s.user_id
   where s.user_id=new.user_id and s.enabled and s.role in ('manager','officer') and u.email_confirmed_at is not null and g.scope_id=c.scope_id and g.enabled)) then raise exception 'case_target_ineligible';end if;
 elsif tg_table_name='recruitment_case_conflicts' then
  if tg_op='UPDATE' and (new.case_id,new.user_id,new.source,new.declared_by,new.created_at) is distinct from (old.case_id,old.user_id,old.source,old.declared_by,old.created_at) then raise exception 'conflict_identity_immutable';end if;
  if new.resolved_at is not null then
   if not public.recruitment_case_staff_allowed(new.resolved_by,new.case_id,'resolve_conflict') or new.resolved_by=new.user_id then raise exception 'independent_authority_required';end if;
   if exists(select 1 from public.recruitment_case_contacts x join auth.users u on u.id=new.user_id where x.case_id=c.id and lower(btrim(u.email))=x.normalized_email and u.email_confirmed_at is not null) then raise exception 'current_identity_conflict';end if;
  end if;
 elsif tg_table_name='recruitment_privacy_holds' then
  if new.purpose<>c.kind then raise exception 'hold_purpose_mismatch';end if;
  if tg_op='INSERT' and not public.recruitment_case_staff_allowed(new.placed_by,new.case_id,'hold') then raise exception 'hold_authority_required';end if;
  if c.deletion_barrier_at is not null then raise exception 'deletion_barrier_crossed';end if;
  if tg_op='UPDATE' and (new.case_id,new.purpose,new.placed_by,new.evidence_ref,new.reason_code,new.placed_at) is distinct from (old.case_id,old.purpose,old.placed_by,old.evidence_ref,old.reason_code,old.placed_at) then raise exception 'hold_evidence_immutable';end if;
  if tg_op='UPDATE' and old.released_at is not null then raise exception 'released_hold_immutable';end if;
  if new.released_by is not null and not public.recruitment_case_staff_allowed(new.released_by,new.case_id,'hold') then raise exception 'hold_authority_required';end if;
 elsif tg_table_name='recruitment_consent_events' then
  if (new.purpose='talent_pool')<>(c.kind='talent_pool') then raise exception 'consent_purpose_mismatch';end if;
  if not exists(select 1 from public.recruitment_case_contacts where case_id=c.id and email_revision=new.email_revision) then raise exception 'consent_verification_required';end if;
  if new.purpose='talent_pool' and new.action in ('affirm','renew') and new.expires_at is distinct from (((new.recorded_at at time zone 'Africa/Johannesburg')+interval '12 months') at time zone 'Africa/Johannesburg') then raise exception 'consent_expiry_mismatch';end if;
 elsif tg_table_name='recruitment_case_challenges' then
  if tg_op='UPDATE' and old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then raise exception 'case_proof_already_consumed';end if;
  if tg_op='UPDATE' and (new.secret_hash,new.case_id,new.actor_id,new.session_hash,new.request_id,new.operation,new.expected_revision,new.change_id,new.payload_digest,new.created_at,new.expires_at)
   is distinct from (old.secret_hash,old.case_id,old.actor_id,old.session_hash,old.request_id,old.operation,old.expected_revision,old.change_id,old.payload_digest,old.created_at,old.expires_at) then raise exception 'case_challenge_immutable';end if;
  if new.change_id is not null then
   select * into b from public.recruitment_staff_change_buffers where id=new.change_id;
   if b.id is null or (b.case_id,b.actor_id,b.session_hash,b.operation,b.expected_revision,b.payload_digest) is distinct from (new.case_id,new.actor_id,new.session_hash,new.operation,new.expected_revision,new.payload_digest)
   or (new.consumed_at is null and b.consumed_at is not null) or b.expires_at<new.expires_at then raise exception 'case_challenge_mismatch';end if;
  end if;
 elsif tg_table_name='recruitment_staff_change_buffers' then
  if tg_op='UPDATE' and old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then raise exception 'case_buffer_already_consumed';end if;
  if tg_op='UPDATE' and (new.id,new.case_id,new.actor_id,new.session_hash,new.operation,new.expected_revision,new.payload,new.payload_digest,new.created_at,new.expires_at)
   is distinct from (old.id,old.case_id,old.actor_id,old.session_hash,old.operation,old.expected_revision,old.payload,old.payload_digest,old.created_at,old.expires_at) then raise exception 'case_buffer_immutable';end if;
 elsif tg_table_name in ('recruitment_case_requests','recruitment_case_audit') then
  if new.actor_kind='staff' and not exists(select 1 from public.recruitment_staff where user_id=new.actor_id) then raise exception 'case_staff_actor_required';end if;
  if tg_table_name='recruitment_case_requests' and tg_op='UPDATE' then
   if (new.case_id,new.actor_kind,new.actor_id,new.request_id,new.operation,new.payload_digest,new.created_at,new.expires_at)
    is distinct from (old.case_id,old.actor_kind,old.actor_id,old.request_id,old.operation,old.payload_digest,old.created_at,old.expires_at)
   or (old.state='committed' and (new.state,new.result_ref) is distinct from (old.state,old.result_ref)) then raise exception 'case_request_immutable';end if;
  end if;
 end if;
 return new;
end$$;
do $$declare t text;begin
 foreach t in array array['recruitment_case_payloads','recruitment_case_assignments','recruitment_case_conflicts','recruitment_privacy_holds','recruitment_consent_events','recruitment_case_challenges','recruitment_case_requests','recruitment_case_audit','recruitment_staff_change_buffers'] loop
  execute format('drop trigger if exists recruitment_case_evidence_guard on public.%I',t);
  execute format('create trigger recruitment_case_evidence_guard before insert or update on public.%I for each row execute function public.recruitment_guard_case_evidence()',t);
 end loop;
 foreach t in array array['recruitment_consent_events','recruitment_case_audit'] loop
  execute format('drop trigger if exists recruitment_case_evidence_immutable on public.%I',t);
  execute format('create trigger recruitment_case_evidence_immutable before update on public.%I for each row execute function public.recruitment_immutable()',t);
 end loop;
 foreach t in array array['recruitment_intake_forms','recruitment_intake_form_bindings','recruitment_cases','recruitment_case_contacts','recruitment_case_payloads','recruitment_case_assignments','recruitment_case_conflicts','recruitment_consent_events','recruitment_case_audit','recruitment_privacy_holds','recruitment_case_requests','recruitment_staff_change_buffers','recruitment_case_challenges'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;

-- Revoke PUBLIC defaults explicitly. No new callable surface ships before M3.2.
revoke all on function public.recruitment_intake_field(text,text,boolean,integer,jsonb),
 public.recruitment_intake_definition(text,text,jsonb),public.recruitment_guard_intake_form(),
 public.recruitment_answers_valid(uuid,jsonb,boolean),public.recruitment_case_conflicted(uuid,uuid),
 public.recruitment_case_staff_allowed(uuid,uuid,text),public.recruitment_retention_deadline(text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz),
 public.recruitment_guard_case(),public.recruitment_guard_case_contact(),public.recruitment_sync_case_contact(),
 public.recruitment_capture_case_conflicts(),public.recruitment_capture_staff_conflicts(),public.recruitment_guard_case_evidence()
 from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261111010000_recruitment_intake_foundation.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261111020000_recruitment_intake_acceptance.sql
-- SHA256 a8076db574006eff3a0b21ee322479ad9821f6158713a934af767347647c5e35
-- M3.1 acceptance corrections only. No endpoint, grant or rollout enablement.
-- Apply AFTER 20261111010000 in a separately approved transaction.
-- Reject inconsistent installed data; never silently label an application withdrawn.
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.recruitment_cases'::regclass and conname='recruitment_case_withdrawal_state') then
  alter table public.recruitment_cases add constraint recruitment_case_withdrawal_state
   check(withdrawn_at is null or state in ('withdrawn','deletion_pending','purged'));
 end if;
end$$;

create or replace function public.recruitment_case_staff_allowed(p_actor uuid,p_case uuid,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;c public.recruitment_cases;begin
 if p_action is null or p_action not in ('read','document','review','assign','revoke_assignment','hold','extend_retention','resolve_conflict') then return false;end if;
 select r.* into s from public.recruitment_staff r join auth.users u on u.id=r.user_id
 where r.user_id=p_actor and r.enabled and u.email_confirmed_at is not null;
 select * into c from public.recruitment_cases where id=p_case;
 if s.user_id is null or c.id is null or c.state='purged' or public.recruitment_case_conflicted(p_actor,p_case) then return false;end if;
 -- Draft answers are private; ended cases retain privacy/governance purposes only.
 if p_action in ('read','document','review','assign','extend_retention')
 and c.state not in ('submitted','under_review','recommendation_recorded') then return false;end if;
 if c.state='deletion_pending' and p_action<>'revoke_assignment'
 and (p_action<>'hold' or c.deletion_barrier_at is not null) then return false;end if;
 if s.role='owner' then return true;end if;
 if p_action in ('hold','extend_retention','resolve_conflict') or not exists(select 1 from public.recruitment_settings where singleton and staff_console_enabled)
 or not exists(select 1 from public.recruitment_staff_scopes where user_id=p_actor and scope_id=c.scope_id and enabled)
 or not exists(select 1 from public.recruitment_case_assignments where case_id=p_case and user_id=p_actor and enabled) then return false;end if;
 return s.role='manager' or p_action in ('read','document','review');
end$$;

-- ECMA-262 whitespace parity with the shared .trim() validator.
create or replace function public.recruitment_answers_valid(p_form uuid,a jsonb,p_complete boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare d jsonb;f jsonb;q jsonb;v jsonb;k text;begin
 select definition into d from public.recruitment_intake_forms where id=p_form;
 if d is null or jsonb_typeof(a) is distinct from 'object' or octet_length(a::text)>65536 or not(a ?& array['fields','questions'])
 or exists(select 1 from jsonb_object_keys(a) x where x not in ('fields','questions'))
 or jsonb_typeof(a->'fields') is distinct from 'object' or jsonb_typeof(a->'questions') is distinct from 'object' then return false;end if;
 if exists(select 1 from jsonb_object_keys(a->'fields') x where not exists(select 1 from jsonb_array_elements(d->'fields') z where z->>'key'=x))
 or exists(select 1 from jsonb_object_keys(a->'questions') x where not exists(select 1 from jsonb_array_elements(d->'questions') z where z->>'key'=x)) then return false;end if;
 for f in select value from jsonb_array_elements(d->'fields') loop
  k=f->>'key';v=a->'fields'->k;
  if v is null then if p_complete and (f->>'required')::boolean then return false;end if;continue;end if;
  if f->>'type'='text' then
   if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>(f->>'maxLength')::integer or (p_complete and (f->>'required')::boolean and length(btrim(v#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0) then return false;end if;
  elsif f->>'type'='boolean' then
   if jsonb_typeof(v) is distinct from 'boolean' or (p_complete and v<>'true'::jsonb) then return false;end if;
  else
   if jsonb_typeof(v) is distinct from 'array' then return false;end if;
   if jsonb_array_length(v)>(select jsonb_array_length(f->'options')) or (p_complete and (f->>'required')::boolean and jsonb_array_length(v)=0)
   or (select count(*)<>count(distinct value) from jsonb_array_elements(v))
   or exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) is distinct from 'string' or not((f->'options') @> jsonb_build_array(x))) then return false;end if;
  end if;
 end loop;
 for q in select value from jsonb_array_elements(d->'questions') loop
  v=a->'questions'->(q->>'key');
  if v is null then if p_complete and (q->>'required')::boolean then return false;end if;continue;end if;
  if q->>'type'='text' and (jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>4000 or (p_complete and (q->>'required')::boolean and length(btrim(v#>>'{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0)) then return false;end if;
  if q->>'type'='yes_no' and jsonb_typeof(v) is distinct from 'boolean' then return false;end if;
  if q->>'type'='number' and (jsonb_typeof(v) is distinct from 'number' or abs((v#>>'{}')::numeric)>1.7976931348623157e308) then return false;end if;
 end loop;
 return true;
exception when others then return false;
end$$;

create or replace function public.recruitment_guard_case_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;b public.recruitment_staff_change_buffers;begin
 select * into c from public.recruitment_cases where id=new.case_id for update;
 if c.id is null then raise exception 'case_unavailable';end if;
 if tg_table_name='recruitment_case_payloads' then
  if new.form_id<>c.form_id and new.kind='draft' then raise exception 'payload_form_mismatch';end if;
  if tg_op='UPDATE' and (old.kind<>'draft' or new.case_id<>old.case_id) then raise exception 'sealed_payload_immutable';end if;
  if new.kind<>'draft' and new.form_id<>c.form_id then raise exception 'payload_form_mismatch';end if;
 elsif tg_table_name='recruitment_case_assignments' then
  if tg_op='UPDATE' and (new.case_id,new.user_id) is distinct from (old.case_id,old.user_id) then raise exception 'assignment_identity_immutable';end if;
  if not public.recruitment_case_staff_allowed(new.granted_by,new.case_id,case when new.enabled then 'assign' else 'revoke_assignment' end) then raise exception 'case_access_denied';end if;
  if new.enabled and (public.recruitment_case_conflicted(new.user_id,new.case_id) or not exists(
   select 1 from public.recruitment_staff s join auth.users u on u.id=s.user_id join public.recruitment_staff_scopes g on g.user_id=s.user_id
   where s.user_id=new.user_id and s.enabled and s.role in ('manager','officer') and u.email_confirmed_at is not null and g.scope_id=c.scope_id and g.enabled)) then raise exception 'case_target_ineligible';end if;
 elsif tg_table_name='recruitment_case_conflicts' then
  if tg_op='UPDATE' and (new.case_id,new.user_id,new.source,new.declared_by,new.created_at) is distinct from (old.case_id,old.user_id,old.source,old.declared_by,old.created_at) then raise exception 'conflict_identity_immutable';end if;
  if new.resolved_at is not null then
   if not public.recruitment_case_staff_allowed(new.resolved_by,new.case_id,'resolve_conflict') or new.resolved_by=new.user_id then raise exception 'independent_authority_required';end if;
   if exists(select 1 from public.recruitment_case_contacts x join auth.users u on u.id=new.user_id where x.case_id=c.id and lower(btrim(u.email))=x.normalized_email and u.email_confirmed_at is not null) then raise exception 'current_identity_conflict';end if;
  end if;
 elsif tg_table_name='recruitment_privacy_holds' then
  if new.purpose<>c.kind then raise exception 'hold_purpose_mismatch';end if;
  if tg_op='INSERT' and not public.recruitment_case_staff_allowed(new.placed_by,new.case_id,'hold') then raise exception 'hold_authority_required';end if;
  if c.deletion_barrier_at is not null then raise exception 'deletion_barrier_crossed';end if;
  if tg_op='UPDATE' and (new.case_id,new.purpose,new.placed_by,new.evidence_ref,new.reason_code,new.placed_at) is distinct from (old.case_id,old.purpose,old.placed_by,old.evidence_ref,old.reason_code,old.placed_at) then raise exception 'hold_evidence_immutable';end if;
  if tg_op='UPDATE' and old.released_at is not null then raise exception 'released_hold_immutable';end if;
  if new.released_by is not null and not public.recruitment_case_staff_allowed(new.released_by,new.case_id,'hold') then raise exception 'hold_authority_required';end if;
 elsif tg_table_name='recruitment_consent_events' then
  if (new.purpose='talent_pool')<>(c.kind='talent_pool') then raise exception 'consent_purpose_mismatch';end if;
  if not exists(select 1 from public.recruitment_case_contacts where case_id=c.id and email_revision=new.email_revision) then raise exception 'consent_verification_required';end if;
  if new.notice_version is distinct from (select privacy_notice_version from public.recruitment_intake_forms where id=c.form_id)
  and not(new.action='withdraw' and exists(select 1 from public.recruitment_consent_events where case_id=c.id and notice_version=new.notice_version and action in ('affirm','renew'))) then raise exception 'consent_notice_mismatch';end if;
  if new.purpose='talent_pool' and new.action in ('affirm','renew') and new.expires_at is distinct from (((new.recorded_at at time zone 'Africa/Johannesburg')+interval '12 months') at time zone 'Africa/Johannesburg') then raise exception 'consent_expiry_mismatch';end if;
 elsif tg_table_name='recruitment_case_challenges' then
  if tg_op='UPDATE' and old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then raise exception 'case_proof_already_consumed';end if;
  if tg_op='UPDATE' and (new.secret_hash,new.case_id,new.actor_id,new.session_hash,new.request_id,new.operation,new.expected_revision,new.change_id,new.payload_digest,new.created_at,new.expires_at)
   is distinct from (old.secret_hash,old.case_id,old.actor_id,old.session_hash,old.request_id,old.operation,old.expected_revision,old.change_id,old.payload_digest,old.created_at,old.expires_at) then raise exception 'case_challenge_immutable';end if;
  if new.change_id is not null then
   select * into b from public.recruitment_staff_change_buffers where id=new.change_id;
   if b.id is null or (b.case_id,b.actor_id,b.session_hash,b.operation,b.expected_revision,b.payload_digest) is distinct from (new.case_id,new.actor_id,new.session_hash,new.operation,new.expected_revision,new.payload_digest)
   or (new.consumed_at is null and b.consumed_at is not null) or b.expires_at<new.expires_at then raise exception 'case_challenge_mismatch';end if;
  end if;
 elsif tg_table_name='recruitment_staff_change_buffers' then
  if tg_op='UPDATE' and old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then raise exception 'case_buffer_already_consumed';end if;
  if tg_op='UPDATE' and (new.id,new.case_id,new.actor_id,new.session_hash,new.operation,new.expected_revision,new.payload,new.payload_digest,new.created_at,new.expires_at)
   is distinct from (old.id,old.case_id,old.actor_id,old.session_hash,old.operation,old.expected_revision,old.payload,old.payload_digest,old.created_at,old.expires_at) then raise exception 'case_buffer_immutable';end if;
 elsif tg_table_name in ('recruitment_case_requests','recruitment_case_audit') then
  if new.actor_kind='staff' and not exists(select 1 from public.recruitment_staff where user_id=new.actor_id) then raise exception 'case_staff_actor_required';end if;
  if tg_table_name='recruitment_case_requests' and tg_op='UPDATE' then
   if (new.case_id,new.actor_kind,new.actor_id,new.request_id,new.operation,new.payload_digest,new.created_at,new.expires_at)
    is distinct from (old.case_id,old.actor_kind,old.actor_id,old.request_id,old.operation,old.payload_digest,old.created_at,old.expires_at)
   or (old.state='committed' and (new.state,new.result_ref) is distinct from (old.state,old.result_ref)) then raise exception 'case_request_immutable';end if;
  end if;
 end if;
 return new;
end$$;

revoke all on function public.recruitment_case_staff_allowed(uuid,uuid,text),public.recruitment_answers_valid(uuid,jsonb,boolean),public.recruitment_guard_case_evidence() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261111020000_recruitment_intake_acceptance.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261111030000_recruitment_applicants.sql
-- SHA256 4c8d6c6e6b9575320ae2bd225f2a6de8bf154dc11f70c9b76b1d6aad35301465
-- M3.2: accountless capabilities. Additive; original five-flag interlock stays ON.
alter table public.recruitment_settings
 add column if not exists intake_operations_approved_at timestamptz,
 add column if not exists intake_operations_approval_ref text,
 add column if not exists backup_retention_days integer check(backup_retention_days between 1 and 3650),
 add column if not exists scanner_policy_version text,
 add column if not exists scanner_attested_at timestamptz;

create table if not exists public.recruitment_privacy_notices (
 version text primary key check(version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
 content text not null check(length(content) between 100 and 20000),
 approval_ref text not null check(approval_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$'),
 approved_by uuid not null references public.recruitment_staff(user_id), approved_at timestamptz not null default clock_timestamp()
);
drop trigger if exists recruitment_notice_immutable on public.recruitment_privacy_notices;
create trigger recruitment_notice_immutable before update or delete on public.recruitment_privacy_notices for each row execute function public.recruitment_immutable();
create table if not exists public.recruitment_intake_limits (
 key_hash text not null check(key_hash ~ '^[0-9a-f]{64}$'), window_start timestamptz not null,
 window_seconds integer not null check(window_seconds in (60,900,3600,86400)), attempts integer not null check(attempts>0),
 expires_at timestamptz not null, primary key(key_hash,window_start,window_seconds)
);
create index if not exists recruitment_intake_limit_expiry on public.recruitment_intake_limits(expires_at);
create table if not exists public.recruitment_email_challenges (
 id uuid primary key, request_id uuid not null unique, purpose text not null check(purpose in ('vacancy','talent_pool')),
 case_id uuid references public.recruitment_cases(id) on delete cascade,
 form_id uuid not null references public.recruitment_intake_forms(id), vacancy_id uuid, publication_id uuid,
 normalized_email text not null check(normalized_email=lower(btrim(normalized_email)) and length(normalized_email)<=254 and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
 email_hmac text not null check(email_hmac ~ '^[0-9a-f]{64}$'), key_version integer not null check(key_version>0),
 email_revision integer not null check(email_revision>0), proof_hash text not null unique check(proof_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
 intent_expires_at timestamptz not null default clock_timestamp()+interval '24 hours', consumed_at timestamptz, revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '16 minutes'),
 check(intent_expires_at<=created_at+interval '24 hours 1 minute')
);
create index if not exists recruitment_email_context_idx on public.recruitment_email_challenges(normalized_email,purpose,vacancy_id,created_at);
create index if not exists recruitment_email_expiry on public.recruitment_email_challenges(intent_expires_at);
create table if not exists public.recruitment_applicant_sessions (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'), email_revision integer not null check(email_revision>0),
 kind text not null check(kind in ('applicant','privacy')), created_at timestamptz not null default clock_timestamp(),
 idle_expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
 absolute_expires_at timestamptz not null default clock_timestamp()+interval '24 hours', revoked_at timestamptz,
 check(idle_expires_at<=absolute_expires_at and isfinite(absolute_expires_at))
);
create unique index if not exists recruitment_session_current on public.recruitment_applicant_sessions(case_id) where revoked_at is null;
create index if not exists recruitment_session_expiry on public.recruitment_applicant_sessions(absolute_expires_at);
create table if not exists public.recruitment_email_outbox (
 id uuid primary key default gen_random_uuid(), case_id uuid references public.recruitment_cases(id) on delete cascade,
 challenge_id uuid references public.recruitment_email_challenges(id) on delete cascade,
 template text not null check(template in ('verify','receipt','clarification','pool_renewal','staff_received','staff_assignment')),
 message_key text not null unique, recipient_staff_id uuid references public.recruitment_staff(user_id), envelope jsonb, status text not null default 'pending' check(status in ('pending','claimed','sent','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 5), available_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours', claim_id uuid, lease_until timestamptz,
 provider_ref text, error_code text, created_at timestamptz not null default clock_timestamp(),
 check(envelope is null or (jsonb_typeof(envelope)='object' and octet_length(envelope::text)<65536))
);
create index if not exists recruitment_outbox_due on public.recruitment_email_outbox(available_at,id) where status in ('pending','claimed');
alter table public.recruitment_case_requests add column if not exists digest_key_version integer not null default 1 check(digest_key_version>0);
alter table public.recruitment_case_requests drop constraint if exists recruitment_case_requests_state_check;
alter table public.recruitment_case_requests add constraint recruitment_case_requests_state_check check(state in ('pending','committed','cancelled'));
alter table public.recruitment_case_requests drop constraint if exists recruitment_case_requests_operation_check;
alter table public.recruitment_case_requests add constraint recruitment_case_requests_operation_check check(operation in ('save','rebase','submit','withdraw','request_deletion','rotate_session','reserve','finalize','discard','assign','note','clarify','recommend','hold','extend_retention','resolve_conflict','cancel_pending','renew','reapply','reply','declare_conflict'));
alter table public.recruitment_case_audit drop constraint if exists recruitment_case_audit_action_check;
alter table public.recruitment_case_audit add constraint recruitment_case_audit_action_check check(action in ('case_created','draft_saved','form_rebased','submitted','withdrawn','expired','assignment_changed','conflict_recorded','conflict_resolved','retention_extended','reapplication_authorized','hold_placed','hold_released','deletion_requested','deletion_barrier','purged','recommendation_recorded','request_cancelled','document_reserved','document_clean','document_rejected','note_recorded','consent_renewed','clarification_recorded'));
alter table public.recruitment_cases add column if not exists current_payload_id uuid;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.recruitment_cases'::regclass and conname='recruitment_case_current_payload') then alter table public.recruitment_cases add constraint recruitment_case_current_payload foreign key(id,current_payload_id) references public.recruitment_case_payloads(case_id,id) deferrable initially deferred; end if;end$$;
drop trigger if exists recruitment_payload_appendonly on public.recruitment_case_payloads;
create trigger recruitment_payload_appendonly before update on public.recruitment_case_payloads for each row execute function public.recruitment_immutable();

create or replace function public.recruitment_json_fields(d jsonb,keys text[]) returns void language plpgsql immutable set search_path='' as $$begin
 if jsonb_typeof(d) is distinct from 'object' or not(d ?& keys) or exists(select 1 from jsonb_object_keys(d) k where not(k=any(keys))) then raise exception 'invalid_request';end if;
 if d ? 'requestId' and (jsonb_typeof(d->'requestId') is distinct from 'string' or d->>'requestId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'invalid_request';end if;
 if d ? 'expectedRevision' and (jsonb_typeof(d->'expectedRevision') is distinct from 'number' or d->>'expectedRevision' !~ '^-?[0-9]{1,10}$' or (d->>'expectedRevision')::bigint not between -1 and 2147483646) then raise exception 'invalid_request';end if;
 if (d ? 'enabled' and jsonb_typeof(d->'enabled') is distinct from 'boolean') or (d ? 'privacyAcknowledged' and jsonb_typeof(d->'privacyAcknowledged') is distinct from 'boolean') or (d ? 'adultConfirmed' and jsonb_typeof(d->'adultConfirmed') is distinct from 'boolean') then raise exception 'invalid_request';end if;
end$$;
create or replace function public.recruitment_intake_ready() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_settings s join public.recruitment_privacy_notices n on n.version=s.intake_privacy_notice_version
 where s.singleton and s.intake_policy_approved_at is not null and s.intake_policy_approval_ref is not null
 and s.case_evidence_days is not null and s.backup_retention_days is not null and s.intake_operations_approved_at is not null)
$$;
create or replace function public.recruitment_intake_count(p_key text,p_window integer,p_limit integer) returns boolean
language plpgsql security definer set search_path='' as $$declare n integer;w timestamptz;begin
 if p_key !~ '^[0-9a-f]{64}$' or p_window not in (60,900,3600,86400) or p_limit not between 1 and 10000 then raise exception 'invalid_request';end if;
 w=to_timestamp(floor(extract(epoch from clock_timestamp())/p_window)*p_window);
 insert into public.recruitment_intake_limits values(p_key,w,p_window,1,w+interval '24 hours') on conflict(key_hash,window_start,window_seconds) do update set attempts=recruitment_intake_limits.attempts+1 returning attempts into n;
 return n<=p_limit;
end$$;
create or replace function public.recruitment_intake_form(p_purpose text,p_slug text default null,p_open boolean default true) returns public.recruitment_intake_forms
language plpgsql stable security definer set search_path='' as $$declare f public.recruitment_intake_forms;v public.recruitment_vacancies;cfg public.recruitment_settings;t timestamptz=clock_timestamp();begin
 select * into cfg from public.recruitment_settings where singleton;
 if not cfg.applicant_email_enabled then raise exception 'intake_disabled';end if;
 if not public.recruitment_intake_ready() then raise exception 'intake_disabled';end if;
 if p_purpose='vacancy' then
  select * into v from public.recruitment_vacancies where slug=p_slug;
  if not cfg.public_vacancies_enabled or not cfg.vacancy_intake_enabled or v.status is distinct from 'published' then raise exception 'intake_disabled';end if;
  select f0.* into f from public.recruitment_intake_forms f0 join public.recruitment_intake_form_bindings b on b.form_id=f0.id and b.enabled
  where f0.vacancy_id=v.id and f0.version_id=v.published_version_id and f0.privacy_notice_version=cfg.intake_privacy_notice_version;
  if p_open and not exists(select 1 from public.recruitment_vacancy_versions where id=v.published_version_id and (content->>'opensAt')::timestamptz<=t and (content->>'closesAt')::timestamptz>t) then raise exception 'applications_closed';end if;
 elsif p_purpose='talent_pool' then
  if not cfg.talent_pool_intake_enabled then raise exception 'intake_disabled';end if;
  select f0.* into f from public.recruitment_intake_forms f0 join public.recruitment_intake_form_bindings b on b.form_id=f0.id and b.enabled where f0.purpose='talent_pool' and f0.privacy_notice_version=cfg.intake_privacy_notice_version;
 else raise exception 'invalid_request';end if;
 if f.id is null then raise exception 'form_unavailable';end if;return f;
end$$;
create or replace function public.recruitment_form_read(p_purpose text,p_slug text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare f public.recruitment_intake_forms;v public.recruitment_vacancies;begin
 f=public.recruitment_intake_form(p_purpose,p_slug);select * into v from public.recruitment_vacancies where id=f.vacancy_id;
 return jsonb_build_object('formId',f.id,'formDigest',f.definition_hash,'definition',f.definition,'privacyNoticeVersion',f.privacy_notice_version,
 'privacyNotice',(select content from public.recruitment_privacy_notices where version=f.privacy_notice_version),'title',coalesce((select content->>'title' from public.recruitment_vacancy_versions where id=f.version_id),'General talent pool'),'slug',v.slug,'purpose',f.purpose);
end$$;
create or replace function public.recruitment_case_log(p_case uuid,p_kind text,p_actor uuid,p_action text,p_request uuid default null,p_digest text default null) returns void
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;days integer;begin
 select * into c from public.recruitment_cases where id=p_case;select case_evidence_days into days from public.recruitment_settings where singleton;
 if days is null then raise exception 'privacy_policy_unapproved';end if;
 insert into public.recruitment_case_audit(case_id,actor_kind,actor_id,action,request_id,revision,payload_digest,expires_at)
 values(c.id,p_kind,p_actor,p_action,p_request,c.revision,p_digest,greatest(c.retention_due_at,clock_timestamp())+make_interval(days=>days));
end$$;
create or replace function public.recruitment_case_session(p_hash text,p_write boolean default false) returns public.recruitment_cases
language plpgsql security definer set search_path='' as $$declare s public.recruitment_applicant_sessions;c public.recruitment_cases;begin
 select * into s from public.recruitment_applicant_sessions where token_hash=p_hash and revoked_at is null and idle_expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp();
 if s.id is null then raise exception 'verification_required';end if;
 select * into c from public.recruitment_cases where id=s.case_id;
 if c.id is null or not exists(select 1 from public.recruitment_case_contacts where case_id=c.id and email_revision=s.email_revision) then
  if s.kind='privacy' and c.id is not null and not p_write then return c;end if;
  raise exception 'verification_required';end if;
 if p_write and (s.kind<>'applicant' or c.state<>'draft' or c.retention_due_at<=clock_timestamp()) then raise exception 'case_unavailable';end if;
 if not p_write and (s.kind='privacy' or c.state in ('withdrawn','expired','deletion_pending','purged') or c.retention_due_at<=clock_timestamp()) then return c;end if;
 update public.recruitment_applicant_sessions set idle_expires_at=least(absolute_expires_at,clock_timestamp()+interval '30 minutes') where id=s.id;
 return c;
end$$;

-- Limits commit on generic suppression, and are isolated from M1 password budgets.
create or replace function public.recruitment_email_request(p_data jsonb,p_id uuid,p_proof_hash text,p_email_hmac text,p_key_version integer,p_envelope jsonb,p_ip_key text,p_email_key text,p_daily_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.recruitment_intake_forms;c public.recruitment_cases;contact public.recruitment_case_contacts;mail text;v_purpose text;v_slug text;v public.recruitment_vacancies;begin
 perform public.recruitment_json_fields(p_data,array['action','requestId','purpose','slug','email','noticeVersion','adultConfirmed','caseReference','privacyAcknowledged']);
 if p_data->>'action' not in ('begin','resend','recover') or p_data->'adultConfirmed' is distinct from 'true'::jsonb or p_data->'privacyAcknowledged' is distinct from 'true'::jsonb or p_proof_hash !~ '^[0-9a-f]{64}$' or p_email_hmac !~ '^[0-9a-f]{64}$' or p_key_version<1 then raise exception 'invalid_request';end if;
 if not exists(select 1 from public.recruitment_settings where singleton and applicant_email_enabled) or not public.recruitment_intake_ready() then raise exception 'intake_disabled';end if;
 if not public.recruitment_intake_count(p_ip_key,900,20) then return jsonb_build_object('accepted',true);end if;
 if not public.recruitment_intake_count(p_email_key,3600,3) then return jsonb_build_object('accepted',true);end if;
 if not public.recruitment_intake_count(p_daily_key,86400,500) then return jsonb_build_object('accepted',true);end if;
 mail=lower(btrim(p_data->>'email'));v_purpose=p_data->>'purpose';v_slug=nullif(p_data->>'slug','');
 if exists(select 1 from public.recruitment_email_challenges where request_id=(p_data->>'requestId')::uuid) then return jsonb_build_object('accepted',true);end if;
 select * into v from public.recruitment_vacancies where v.slug=v_slug;
 select x.* into contact from public.recruitment_case_contacts x where x.normalized_email=mail and x.kind=v_purpose and
 ((v_purpose='vacancy' and x.vacancy_id=v.id) or (v_purpose='talent_pool' and x.vacancy_id is null))
 and ((p_data->>'caseReference')='' or exists(select 1 from public.recruitment_cases where id=x.case_id and reference::text=p_data->>'caseReference'))
 order by x.active desc limit 1;
 if contact.case_id is not null then select * into c from public.recruitment_cases where id=contact.case_id;end if;
 if c.id is not null and p_data->>'action'='recover' then f=(select ff from public.recruitment_intake_forms ff where ff.id=c.form_id);
 else
  begin f=public.recruitment_intake_form(v_purpose,v_slug);exception when raise_exception then return jsonb_build_object('accepted',true);end;
 end if;
 if f.id is null or (p_data->>'action'<>'recover' and p_data->>'noticeVersion'<>f.privacy_notice_version) or (p_data->>'caseReference'<>'' and c.id is null) then return jsonb_build_object('accepted',true);end if;
 if exists(select 1 from public.recruitment_email_challenges where normalized_email=mail and purpose=f.purpose and vacancy_id is not distinct from f.vacancy_id and created_at>clock_timestamp()-interval '60 seconds') then return jsonb_build_object('accepted',true);end if;
 insert into public.recruitment_email_challenges(id,request_id,purpose,case_id,form_id,vacancy_id,publication_id,normalized_email,email_hmac,key_version,email_revision,proof_hash)
 values(p_id,(p_data->>'requestId')::uuid,f.purpose,c.id,f.id,f.vacancy_id,(select id from public.recruitment_vacancy_publications where vacancy_id=f.vacancy_id and version_id=f.version_id order by created_at desc,id desc limit 1),mail,p_email_hmac,p_key_version,coalesce(contact.email_revision,1),p_proof_hash);
 insert into public.recruitment_email_outbox(challenge_id,case_id,template,message_key,envelope,expires_at) values(p_id,c.id,'verify',p_id::text,p_envelope,clock_timestamp()+interval '15 minutes');
 return jsonb_build_object('accepted',true);
end$$;
create or replace function public.recruitment_email_inspect(p_id uuid,p_hash text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare e public.recruitment_email_challenges;begin
 select * into e from public.recruitment_email_challenges where id=p_id and proof_hash=p_hash and consumed_at is null and revoked_at is null and expires_at>clock_timestamp();
 if e.id is null then raise exception 'invalid_proof';end if;
 return jsonb_build_object('maskedEmail',left(e.normalized_email,1)||'***@'||split_part(e.normalized_email,'@',2),'purpose',e.purpose,'expiresAt',e.expires_at);
end$$;
create or replace function public.recruitment_email_exchange(p_id uuid,p_proof_hash text,p_email text,p_session_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.recruitment_email_challenges;c public.recruitment_cases;f public.recruitment_intake_forms;contact public.recruitment_case_contacts;pid uuid;mode text;v public.recruitment_vacancies;begin
 select * into e from public.recruitment_email_challenges where id=p_id and proof_hash=p_proof_hash and normalized_email=lower(btrim(p_email)) and consumed_at is null and revoked_at is null and expires_at>clock_timestamp();
 if e.id is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_proof';end if;
 perform 1 from public.recruitment_settings where singleton and applicant_email_enabled for share;
 if not found or not public.recruitment_intake_ready() then raise exception 'intake_disabled';end if;
 if e.vacancy_id is not null then select * into v from public.recruitment_vacancies where id=e.vacancy_id for share;end if;
 if e.case_id is not null then select * into c from public.recruitment_cases where id=e.case_id for update;
 else
  select cc.* into c from public.recruitment_cases cc join public.recruitment_case_contacts ct on ct.case_id=cc.id where ct.normalized_email=e.normalized_email and ct.kind=e.purpose and ct.vacancy_id is not distinct from e.vacancy_id and ct.active for update of cc;
 end if;
 if c.id is null then
  f=public.recruitment_intake_form(e.purpose,v.slug);
  if f.id<>e.form_id then raise exception 'requirements_changed';end if;
  begin
   pid=gen_random_uuid();
   insert into public.recruitment_cases(kind,scope_id,vacancy_id,version_id,publication_id,form_id,current_payload_id,retention_due_at)
   values(f.purpose,f.scope_id,f.vacancy_id,f.version_id,e.publication_id,f.id,pid,clock_timestamp()) returning * into c;
   insert into public.recruitment_case_contacts(case_id,kind,scope_id,vacancy_id,normalized_email,email_hmac,key_version,verified_at)
   values(c.id,c.kind,c.scope_id,c.vacancy_id,e.normalized_email,e.email_hmac,e.key_version,clock_timestamp());
   insert into public.recruitment_case_payloads(id,case_id,form_id,revision,kind,answers) values(pid,c.id,c.form_id,0,'draft','{"fields":{},"questions":{}}');
   perform public.recruitment_case_log(c.id,'applicant',c.id,'case_created');
  exception when unique_violation then
   select cc.* into c from public.recruitment_cases cc join public.recruitment_case_contacts ct on ct.case_id=cc.id where ct.normalized_email=e.normalized_email and ct.kind=e.purpose and ct.vacancy_id is not distinct from e.vacancy_id and ct.active for update of cc;
   if c.id is null then raise exception 'case_unavailable';end if;
  end;
 end if;
 select * into contact from public.recruitment_case_contacts where case_id=c.id for update;
 if contact.normalized_email is distinct from e.normalized_email or contact.email_revision<>e.email_revision then raise exception 'invalid_proof';end if;
 update public.recruitment_email_challenges set consumed_at=clock_timestamp(),case_id=c.id where id=e.id and proof_hash=p_proof_hash and consumed_at is null and revoked_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'invalid_proof';end if;
 update public.recruitment_email_challenges set revoked_at=clock_timestamp() where id<>e.id and normalized_email=e.normalized_email and purpose=e.purpose and vacancy_id is not distinct from e.vacancy_id and consumed_at is null and revoked_at is null;
 update public.recruitment_email_outbox set status='cancelled',envelope=null where challenge_id in(select id from public.recruitment_email_challenges where case_id=c.id and (consumed_at is not null or revoked_at is not null)) and status in ('pending','claimed');
 mode=case when c.state in ('withdrawn','expired','deletion_pending','purged') or c.retention_due_at<=clock_timestamp() then 'privacy' else 'applicant' end;
 update public.recruitment_applicant_sessions set revoked_at=clock_timestamp() where case_id=c.id and revoked_at is null;
 insert into public.recruitment_applicant_sessions(case_id,token_hash,email_revision,kind) values(c.id,p_session_hash,contact.email_revision,mode);
 if c.kind='vacancy' and c.state='draft' then insert into public.recruitment_consent_events(case_id,purpose,action,notice_version,email_revision,evidence_expires_at)
 values(c.id,'vacancy_notice','acknowledge',(select privacy_notice_version from public.recruitment_intake_forms where id=c.form_id),contact.email_revision,c.retention_due_at+make_interval(days=>(select case_evidence_days from public.recruitment_settings where singleton)));end if;
 return jsonb_build_object('caseReference',c.reference,'revision',c.revision,'kind',mode);
end$$;

create or replace function public.recruitment_applicant_read(p_hash text,p_request uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;f public.recruitment_intake_forms;r public.recruitment_case_requests;private_only boolean;begin
 c=public.recruitment_case_session(p_hash);select * into f from public.recruitment_intake_forms where id=c.form_id;
 private_only=c.state in ('withdrawn','expired','deletion_pending','purged') or c.retention_due_at<=clock_timestamp() or exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and kind='privacy');
 select * into r from public.recruitment_case_requests where (case_id=c.id or (operation='reapply' and result_ref=c.id)) and actor_kind='applicant' and request_id=p_request;
 return jsonb_build_object('id',c.id,'caseReference',c.reference,'state',c.state,'purpose',c.kind,'revision',c.revision,'expiresAt',c.retention_due_at,
 'slug',(select slug from public.recruitment_vacancies where id=c.vacancy_id),'reapplicationAllowed',c.state in ('withdrawn','expired') and c.reapply_authorized_by is not null and c.reapply_consumed_at is null and c.reapply_expires_at>clock_timestamp(),
 'formId',f.id,'definition',case when private_only then null else f.definition end,'noticeVersion',f.privacy_notice_version,
 'notice',case when private_only then null else (select content from public.recruitment_privacy_notices where version=f.privacy_notice_version) end,
 'answers',case when private_only then null else (select answers from public.recruitment_case_payloads where id=c.current_payload_id) end,
 'request',case when r.request_id is null then null else jsonb_build_object('state',r.state,'resultRef',r.result_ref,'digestKeyVersion',r.digest_key_version,'operation',r.operation) end);
end$$;

-- Generic authenticated draft command: every released action has an explicit schema.
create or replace function public.recruitment_applicant_mutate(p_hash text,p_action text,p_data jsonb,p_digest text,p_key_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;f public.recruitment_intake_forms;r public.recruitment_case_requests;pid uuid;rid uuid;a jsonb;patch jsonb;k text;v jsonb;contact public.recruitment_case_contacts;old_form uuid;begin
 c=public.recruitment_case_session(p_hash);
 perform 1 from public.recruitment_settings where singleton for share;
 if c.vacancy_id is not null then perform 1 from public.recruitment_vacancies where id=c.vacancy_id for share;end if;
 select * into c from public.recruitment_cases where id=c.id for update;
 c=public.recruitment_case_session(p_hash);
 if p_digest !~ '^[0-9a-f]{64}$' or p_key_version<1 or p_data->>'requestId' is null then raise exception 'invalid_request';end if;
 rid=(p_data->>'requestId')::uuid;
 select * into r from public.recruitment_case_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=rid;
 if r.request_id is not null then
  if r.state='cancelled' then raise exception 'request_cancelled';end if;
  if r.operation<>p_action or r.payload_digest<>p_digest or r.digest_key_version<>p_key_version then raise exception 'request_conflict';end if;
  return jsonb_build_object('saved',true,'replayed',true,'resultRef',r.result_ref,'revision',(select revision from public.recruitment_case_payloads where id=r.result_ref));
 end if;
 if p_action='cancel_pending' then
  perform public.recruitment_json_fields(p_data,array['requestId','pendingRequestId','operation']);
  if p_data->>'operation' not in ('save','rebase','submit','withdraw','request_deletion','renew','reserve','reply','reapply') then raise exception 'invalid_request';end if;
  select * into r from public.recruitment_case_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=(p_data->>'pendingRequestId')::uuid;
  if r.request_id is null then insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,expires_at)
   values(c.id,'applicant',c.id,(p_data->>'pendingRequestId')::uuid,p_data->>'operation',p_digest,p_key_version,'cancelled',c.retention_due_at);end if;
  pid=coalesce(r.result_ref,c.current_payload_id,c.reference);
  perform public.recruitment_case_log(c.id,'applicant',c.id,'request_cancelled',rid,p_digest);
 elsif p_action in ('save','rebase') then
  c=public.recruitment_case_session(p_hash,true);
  if c.revision<>(p_data->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
  f=public.recruitment_intake_form(c.kind,(select slug from public.recruitment_vacancies where id=c.vacancy_id));
  if p_action='save' then
   perform public.recruitment_json_fields(p_data,array['requestId','expectedRevision','formId','answersPatch']);
   if f.id<>c.form_id or f.id<>(p_data->>'formId')::uuid then raise exception 'requirements_changed';end if;
   select answers into a from public.recruitment_case_payloads where id=c.current_payload_id;
   patch=p_data->'answersPatch';perform public.recruitment_json_fields(patch,array['fields','questions']);
   foreach k in array array['fields','questions'] loop
    if jsonb_typeof(patch->k) is distinct from 'object' then raise exception 'invalid_request';end if;
    for v in select jsonb_build_object('key',key,'value',value) from jsonb_each(patch->k) loop
     if v->'value'='null'::jsonb then a=jsonb_set(a,array[k],(a->k)-(v->>'key'));else a=jsonb_set(a,array[k,v->>'key'],v->'value');end if;
    end loop;
   end loop;
  else
   perform public.recruitment_json_fields(p_data,array['requestId','expectedRevision','formId','noticeVersion','privacyAcknowledged']);
   if f.id<>(p_data->>'formId')::uuid or f.privacy_notice_version<>p_data->>'noticeVersion' or p_data->'privacyAcknowledged'<>'true'::jsonb then raise exception 'requirements_changed';end if;
   select answers into a from public.recruitment_case_payloads where id=c.current_payload_id;
   -- Carry only values still valid under the new allowlist/type/options. Incompatible values are omitted.
   patch='{"fields":{},"questions":{}}';
   foreach k in array array['fields','questions'] loop
    for v in select jsonb_build_object('key',key,'value',value) from jsonb_each(a->k) loop
     if public.recruitment_answers_valid(f.id,jsonb_set(patch,array[k,v->>'key'],v->'value'),false) then patch=jsonb_set(patch,array[k,v->>'key'],v->'value');end if;
    end loop;
   end loop;
   a=jsonb_set(patch,'{fields,privacyAcknowledged}','true');
  end if;
  if not public.recruitment_answers_valid(f.id,a,false) then raise exception 'invalid_request';end if;
  pid=gen_random_uuid();old_form=c.form_id;
  -- Rebase changes the case pins before inserting its new form-bound payload.
  update public.recruitment_cases set form_id=f.id,version_id=f.version_id,publication_id=case when f.vacancy_id is null then null else (select id from public.recruitment_vacancy_publications where vacancy_id=f.vacancy_id and version_id=f.version_id order by created_at desc,id desc limit 1) end,
   current_payload_id=pid,revision=revision+1,last_activity_at=case when a is distinct from (select answers from public.recruitment_case_payloads where id=c.current_payload_id) then clock_timestamp() else last_activity_at end where id=c.id returning * into c;
  insert into public.recruitment_case_payloads(id,case_id,form_id,revision,kind,answers) values(pid,c.id,f.id,c.revision,'draft',a);
  if p_action='rebase' then perform public.recruitment_rebase_documents(c.id,old_form,f.id);end if;
  if p_action='rebase' and c.kind='vacancy' then
   select * into contact from public.recruitment_case_contacts where case_id=c.id;
   insert into public.recruitment_consent_events(case_id,purpose,action,notice_version,email_revision,evidence_expires_at) values(c.id,case when c.kind='vacancy' then 'vacancy_notice' else 'talent_pool' end,case when c.kind='vacancy' then 'acknowledge' else 'affirm' end,f.privacy_notice_version,contact.email_revision,c.retention_due_at+make_interval(days=>(select case_evidence_days from public.recruitment_settings where singleton)));
  end if;
  perform public.recruitment_case_log(c.id,'applicant',c.id,case when p_action='save' then 'draft_saved' else 'form_rebased' end,rid,p_digest);
 else raise exception 'invalid_request';end if;
 insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,result_ref,expires_at)
 values(c.id,'applicant',c.id,rid,p_action,p_digest,p_key_version,'committed',pid,c.retention_due_at+make_interval(days=>(select case_evidence_days from public.recruitment_settings where singleton)));
 return jsonb_build_object('saved',true,'resultRef',pid,'revision',c.revision,'savedAt',clock_timestamp());
end$$;
create or replace function public.recruitment_applicant_logout(p_hash text) returns void language sql security definer set search_path='' as $$
 update public.recruitment_applicant_sessions set revoked_at=clock_timestamp() where token_hash=p_hash and revoked_at is null
$$;

-- Non-PII owner governance reuses existing action-bound confirmation and journals.
create or replace function public.recruitment_intake_authorize(p_actor uuid,p_operation text,d jsonb) returns void
language plpgsql stable security definer set search_path='' as $$begin
 perform public.recruitment_assert(p_actor,true);
 if p_operation='intake_policy' then perform public.recruitment_json_fields(d,array['requestId','noticeVersion','noticeText','approvalReference','evidenceDays']);
  if length(d->>'noticeText') not between 100 and 20000 or d->>'approvalReference' !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' or (d->>'evidenceDays')::integer not between 1 and 3650 then raise exception 'invalid_request';end if;
 elsif p_operation='intake_form_approve' then perform public.recruitment_json_fields(d,array['requestId','purpose','vacancyId','versionId','noticeVersion']);
 elsif p_operation='intake_form_bind' then perform public.recruitment_json_fields(d,array['requestId','formId','expectedRevision','enabled']);
 else raise exception 'invalid_request';end if;
 if d->>'requestId' is null then raise exception 'invalid_request';end if;
end$$;
create or replace function public.recruitment_intake_governance(p_actor uuid,p_operation text,d jsonb,p_session_hash text,p_proof_hash text,p_aal text) returns jsonb
language plpgsql security definer set search_path='' as $$declare prior public.recruitment_requests;rid uuid=(d->>'requestId')::uuid;f public.recruitment_intake_forms;v public.recruitment_vacancies;scope uuid;content jsonb;result jsonb;begin
 perform 1 from public.recruitment_settings where singleton for update;
 perform public.recruitment_intake_authorize(p_actor,p_operation,d);perform public.recruitment_require_assurance(p_actor,p_aal);
 select * into prior from public.recruitment_requests where id=rid;
 if prior.id is not null then if prior.actor_id<>p_actor or prior.operation<>p_operation or prior.payload<>d then raise exception 'request_conflict';end if;return prior.result;end if;
 update public.recruitment_reauth_challenges set consumed_at=clock_timestamp() where secret_hash=p_proof_hash and actor_id=p_actor and session_hash=p_session_hash and operation=p_operation and payload=d and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'Fresh action-specific authentication is required.';end if;
 if p_operation='intake_policy' then
  insert into public.recruitment_privacy_notices(version,content,approval_ref,approved_by) values(d->>'noticeVersion',d->>'noticeText',d->>'approvalReference',p_actor);
  update public.recruitment_settings set intake_privacy_notice_version=d->>'noticeVersion',intake_policy_approval_ref=d->>'approvalReference',intake_policy_approved_at=clock_timestamp(),case_evidence_days=(d->>'evidenceDays')::integer,revision=revision+1 where singleton;
  result=jsonb_build_object('saved',true);
 elsif p_operation='intake_form_approve' then
  if not exists(select 1 from public.recruitment_privacy_notices where version=d->>'noticeVersion') then raise exception 'privacy_policy_unapproved';end if;
  if d->>'purpose'='vacancy' then
   select * into v from public.recruitment_vacancies where id=(d->>'vacancyId')::uuid;
   select x.content into content from public.recruitment_vacancy_versions x join public.recruitment_vacancy_approvals a on a.vacancy_id=x.vacancy_id and a.version_id=x.id where x.id=(d->>'versionId')::uuid and x.vacancy_id=v.id;
   if content is null then raise exception 'form_unavailable';end if;scope=v.scope_id;
  elsif d->>'purpose'='talent_pool' then
   if d->'vacancyId'<>'null'::jsonb or d->'versionId'<>'null'::jsonb then raise exception 'invalid_request';end if;
   select id into scope from public.recruitment_scopes where kind='talent_pool';
   if scope is null then insert into public.recruitment_scopes(kind,label) values('talent_pool','General talent pool') returning id into scope;end if;
  else raise exception 'invalid_request';end if;
  insert into public.recruitment_intake_forms(purpose,scope_id,vacancy_id,version_id,category,definition,privacy_notice_version,document_policy_version,approved_by)
  values(d->>'purpose',scope,v.id,(d->>'versionId')::uuid,content->>'category',public.recruitment_intake_definition(d->>'purpose',content->>'category',content),d->>'noticeVersion','pdf-v1',p_actor) returning * into f;
  result=jsonb_build_object('saved',true,'formId',f.id);
 else
  select * into f from public.recruitment_intake_forms where id=(d->>'formId')::uuid;
  if f.id is null then raise exception 'form_unavailable';end if;
  if coalesce((select revision from public.recruitment_intake_form_bindings where form_id=f.id),-1)<>(d->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
  if (d->>'enabled')::boolean then update public.recruitment_intake_form_bindings set enabled=false,revision=revision+1,updated_by=p_actor where enabled and purpose=f.purpose and ((vacancy_id=f.vacancy_id and version_id=f.version_id) or (f.purpose='talent_pool' and scope_id=f.scope_id));end if;
  insert into public.recruitment_intake_form_bindings(form_id,purpose,scope_id,vacancy_id,version_id,enabled,updated_by) values(f.id,f.purpose,f.scope_id,f.vacancy_id,f.version_id,(d->>'enabled')::boolean,p_actor)
  on conflict(form_id) do update set enabled=excluded.enabled,revision=recruitment_intake_form_bindings.revision+1,updated_by=p_actor;
  result=jsonb_build_object('saved',true,'formId',f.id);
 end if;
 insert into public.recruitment_requests values(rid,p_actor,p_operation,d,result,clock_timestamp());
 insert into public.recruitment_events(actor_id,action,target_id,request_id,details) values(p_actor,p_operation,f.id,rid,jsonb_build_object('authority','recruitment_owner','formId',f.id));
 return result;
end$$;

do $$declare t text;begin
 foreach t in array array['recruitment_privacy_notices','recruitment_intake_limits','recruitment_email_challenges','recruitment_applicant_sessions','recruitment_email_outbox'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;
revoke all on function public.recruitment_json_fields(jsonb,text[]),public.recruitment_intake_ready(),public.recruitment_intake_count(text,integer,integer),public.recruitment_intake_form(text,text,boolean),public.recruitment_form_read(text,text),public.recruitment_case_log(uuid,text,uuid,text,uuid,text),public.recruitment_case_session(text,boolean),public.recruitment_email_request(jsonb,uuid,text,text,integer,jsonb,text,text,text),public.recruitment_email_inspect(uuid,text),public.recruitment_email_exchange(uuid,text,text,text),public.recruitment_applicant_read(text,uuid),public.recruitment_applicant_mutate(text,text,jsonb,text,integer),public.recruitment_applicant_logout(text),public.recruitment_intake_authorize(uuid,text,jsonb),public.recruitment_intake_governance(uuid,text,jsonb,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_form_read(text,text),public.recruitment_intake_count(text,integer,integer),public.recruitment_email_request(jsonb,uuid,text,text,integer,jsonb,text,text,text),public.recruitment_email_inspect(uuid,text),public.recruitment_email_exchange(uuid,text,text,text),public.recruitment_applicant_read(text,uuid),public.recruitment_applicant_mutate(text,text,jsonb,text,integer),public.recruitment_applicant_logout(text) to service_role;

create or replace function public.recruitment_authorize(p_actor uuid,p_operation text,p_data jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff; target uuid; scope uuid; allowed text[];begin
 if left(p_operation,7)='intake_' then perform public.recruitment_intake_authorize(p_actor,p_operation,p_data);return;end if;
 if left(p_operation,8)='vacancy_' then perform public.recruitment_vacancy_authorize(p_actor,p_operation,p_data);return;end if;
 s=public.recruitment_assert(p_actor);
 if p_operation not in ('staff_grant','scope_create','scope_grant','settings') then raise exception 'This recruitment operation has not been released.';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or nullif(p_data->>'requestId','') is null then raise exception 'Choose a stable request and valid details.';end if;
 allowed=case p_operation when 'staff_grant' then array['requestId','userId','role','enabled','expectedRevision'] when 'scope_grant' then array['requestId','userId','scopeId','enabled','expectedRevision'] when 'scope_create' then array['requestId','kind','label'] else array['requestId','expectedRevision','staffConsoleEnabled','accessGuardsEnabled','privacyPolicyVersion'] end;
 if not (p_data ?& allowed) or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(allowed))) then raise exception 'Only the released security fields are accepted.';end if;
 if p_operation in ('staff_grant','scope_grant') and (jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or (p_data->>'expectedRevision')::integer < -1) then raise exception 'Choose a state and expected revision.';end if;
 if p_operation='settings' and (jsonb_typeof(p_data->'staffConsoleEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'accessGuardsEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'expectedRevision') is distinct from 'number' or jsonb_typeof(p_data->'privacyPolicyVersion') is distinct from 'string') then raise exception 'Choose valid rollout controls.';end if;
 if p_operation='settings' and (p_data->>'staffConsoleEnabled')::boolean and not (p_data->>'accessGuardsEnabled')::boolean then raise exception 'Enable the access safeguards before enabling the staff console.';end if;
 if p_operation<>'scope_grant' then perform public.recruitment_assert(p_actor,true);
 else
  target=(p_data->>'userId')::uuid;scope=(p_data->>'scopeId')::uuid;
  if not exists(select 1 from public.recruitment_staff where user_id=target) or not exists(select 1 from public.recruitment_scopes where id=scope) then raise exception 'Choose an existing recruitment staff identity and scope.';end if;
  if s.role<>'owner' and (s.role<>'manager' or not exists(select 1 from public.recruitment_staff_scopes where user_id=p_actor and scope_id=scope and enabled) or not exists(select 1 from public.recruitment_staff where user_id=target and role='officer' and enabled) or not exists(select 1 from public.recruitment_staff_scopes where user_id=target and scope_id=scope)) then raise exception 'Scope delegation is not permitted.';end if;
 end if;
 if p_operation in ('staff_grant','scope_grant') and (p_data->>'userId')::uuid=p_actor then raise exception 'You cannot change your own recruitment grants.';end if;
end$$;

create or replace function public.recruitment_mutate(p_actor uuid,p_operation text,p_data jsonb,p_session_hash text,p_proof_hash text,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.recruitment_settings; prior public.recruitment_requests; staff public.recruitment_staff;
 rid uuid=(p_data->>'requestId')::uuid; target uuid; scope uuid; rev integer; result jsonb; before_row jsonb;
begin
 if left(p_operation,7)='intake_' then return public.recruitment_intake_governance(p_actor,p_operation,p_data,p_session_hash,p_proof_hash,p_aal);end if;
 if left(p_operation,8)='vacancy_' then return public.recruitment_vacancy_mutate(p_actor,p_operation,p_data,p_session_hash,p_proof_hash,p_aal);end if;
 select * into cfg from public.recruitment_settings where singleton for update;
 perform public.recruitment_authorize(p_actor,p_operation,p_data);
 perform public.recruitment_require_assurance(p_actor,p_aal);
 if rid is null then raise exception 'A stable request ID is required.';end if;
 select * into prior from public.recruitment_requests where id=rid;
 if prior.id is not null then
  if prior.actor_id<>p_actor or prior.operation<>p_operation or prior.payload<>p_data then raise exception 'Request ID conflicts with an earlier operation.';end if;
  return prior.result;
 end if;
 update public.recruitment_reauth_challenges set consumed_at=now()
 where secret_hash=p_proof_hash and actor_id=p_actor and session_hash=p_session_hash and operation=p_operation and payload=p_data and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'Fresh action-specific authentication is required.';end if;
 if p_operation='staff_grant' then
  target=(p_data->>'userId')::uuid;
  select * into staff from public.recruitment_staff where user_id=target;
  -- Verification gates additions/elevation, never removal of existing authority.
  if (staff.user_id is null or ((p_data->>'enabled')::boolean and (not staff.enabled or
      (case p_data->>'role' when 'owner' then 3 when 'manager' then 2 else 1 end) >
      (case staff.role when 'owner' then 3 when 'manager' then 2 else 1 end))))
      and not exists(select 1 from auth.users where id=target and email_confirmed_at is not null)
  then raise exception 'Choose an existing verified Auth identity for new or increased access.';end if;
  if coalesce(staff.revision,-1)<>(p_data->>'expectedRevision')::integer then raise exception 'Staff permissions changed. Refresh and review again.';end if;
  if staff.role='owner' and staff.enabled and (p_data->>'role'<>'owner' or not (p_data->>'enabled')::boolean) and (select count(*) from public.recruitment_staff where role='owner' and enabled)<=1 then raise exception 'Keep at least one enabled recruitment owner.';end if;
  before_row=jsonb_build_object('role',staff.role,'enabled',staff.enabled,'revision',staff.revision);
  insert into public.recruitment_staff(user_id,role,enabled,granted_by) values(target,p_data->>'role',(p_data->>'enabled')::boolean,p_actor)
  on conflict(user_id) do update set role=excluded.role,enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_staff.revision+1,updated_at=now();
  result=jsonb_build_object('userId',target);
 elsif p_operation='scope_create' then
  if p_data->>'kind'='talent_pool' and exists(select 1 from public.recruitment_scopes where kind='talent_pool') then raise exception 'The talent-pool scope already exists. Choose the existing scope.';end if;
  insert into public.recruitment_scopes(kind,label) values(p_data->>'kind',trim(p_data->>'label')) returning id into scope;
  result=jsonb_build_object('scopeId',scope);
 elsif p_operation='scope_grant' then
  target=(p_data->>'userId')::uuid;scope=(p_data->>'scopeId')::uuid;
  select revision,to_jsonb(g) into rev,before_row from public.recruitment_staff_scopes g where user_id=target and scope_id=scope;
  if (p_data->>'enabled')::boolean and not coalesce((before_row->>'enabled')::boolean,false)
  and not exists(select 1 from auth.users where id=target and email_confirmed_at is not null)
  then raise exception 'Choose an existing verified Auth identity for new or increased scope access.';end if;
  if coalesce(rev,-1)<>(p_data->>'expectedRevision')::integer then raise exception 'Scope permissions changed. Refresh and review again.';end if;
  insert into public.recruitment_staff_scopes(user_id,scope_id,enabled,granted_by) values(target,scope,(p_data->>'enabled')::boolean,p_actor)
  on conflict(user_id,scope_id) do update set enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_staff_scopes.revision+1;
  result=jsonb_build_object('userId',target,'scopeId',scope);
 elsif p_operation='settings' then
  if cfg.access_guards_mandatory and not (p_data->>'accessGuardsEnabled')::boolean then
   raise exception 'Mandatory access safeguards require separately approved operational intervention.';
  end if;
  if cfg.revision<>(p_data->>'expectedRevision')::integer then raise exception 'Recruitment settings changed. Refresh and review again.';end if;
  before_row=to_jsonb(cfg)-'bootstrapped_at';
  update public.recruitment_settings set staff_console_enabled=(p_data->>'staffConsoleEnabled')::boolean,access_guards_enabled=(p_data->>'accessGuardsEnabled')::boolean,privacy_policy_version=trim(p_data->>'privacyPolicyVersion'),revision=revision+1 where singleton;
  result=jsonb_build_object('saved',true);
 end if;
 insert into public.recruitment_events(actor_id,action,target_id,request_id,details) values(p_actor,p_operation,coalesce(target,scope),rid,jsonb_build_object('before',before_row,'choices',p_data-'requestId','authority','recruitment_staff'));
 insert into public.recruitment_requests(id,actor_id,operation,payload,result) values(rid,p_actor,p_operation,p_data,result);
 return result;
end$$;

create or replace function public.recruitment_guard_case_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;b public.recruitment_staff_change_buffers;begin
 select * into c from public.recruitment_cases where id=new.case_id for update;
 if c.id is null then raise exception 'case_unavailable';end if;
 if tg_table_name='recruitment_case_payloads' then
  if new.form_id<>c.form_id and new.kind='draft' then raise exception 'payload_form_mismatch';end if;
  if tg_op='UPDATE' and (old.kind<>'draft' or new.case_id<>old.case_id) then raise exception 'sealed_payload_immutable';end if;
  if new.kind<>'draft' and new.form_id<>c.form_id then raise exception 'payload_form_mismatch';end if;
 elsif tg_table_name='recruitment_case_assignments' then
  if tg_op='UPDATE' and (new.case_id,new.user_id) is distinct from (old.case_id,old.user_id) then raise exception 'assignment_identity_immutable';end if;
  if not public.recruitment_case_staff_allowed(new.granted_by,new.case_id,case when new.enabled then 'assign' else 'revoke_assignment' end) then raise exception 'case_access_denied';end if;
  if new.enabled and (public.recruitment_case_conflicted(new.user_id,new.case_id) or not exists(
   select 1 from public.recruitment_staff s join auth.users u on u.id=s.user_id join public.recruitment_staff_scopes g on g.user_id=s.user_id
   where s.user_id=new.user_id and s.enabled and s.role in ('manager','officer') and u.email_confirmed_at is not null and g.scope_id=c.scope_id and g.enabled)) then raise exception 'case_target_ineligible';end if;
 elsif tg_table_name='recruitment_case_conflicts' then
  if tg_op='UPDATE' and (new.case_id,new.user_id,new.source,new.declared_by,new.created_at) is distinct from (old.case_id,old.user_id,old.source,old.declared_by,old.created_at) then raise exception 'conflict_identity_immutable';end if;
  if new.resolved_at is not null then
   if not public.recruitment_case_staff_allowed(new.resolved_by,new.case_id,'resolve_conflict') or new.resolved_by=new.user_id then raise exception 'independent_authority_required';end if;
   if exists(select 1 from public.recruitment_case_contacts x join auth.users u on u.id=new.user_id where x.case_id=c.id and lower(btrim(u.email))=x.normalized_email and u.email_confirmed_at is not null) then raise exception 'current_identity_conflict';end if;
  end if;
 elsif tg_table_name='recruitment_privacy_holds' then
  if new.purpose<>c.kind then raise exception 'hold_purpose_mismatch';end if;
  if tg_op='INSERT' and not public.recruitment_case_staff_allowed(new.placed_by,new.case_id,'hold') then raise exception 'hold_authority_required';end if;
  if c.deletion_barrier_at is not null then raise exception 'deletion_barrier_crossed';end if;
  if tg_op='UPDATE' and (new.case_id,new.purpose,new.placed_by,new.evidence_ref,new.reason_code,new.placed_at) is distinct from (old.case_id,old.purpose,old.placed_by,old.evidence_ref,old.reason_code,old.placed_at) then raise exception 'hold_evidence_immutable';end if;
  if tg_op='UPDATE' and old.released_at is not null then raise exception 'released_hold_immutable';end if;
  if new.released_by is not null and not public.recruitment_case_staff_allowed(new.released_by,new.case_id,'hold') then raise exception 'hold_authority_required';end if;
 elsif tg_table_name='recruitment_consent_events' then
  if (new.purpose='talent_pool')<>(c.kind='talent_pool') then raise exception 'consent_purpose_mismatch';end if;
  if not exists(select 1 from public.recruitment_case_contacts where case_id=c.id and email_revision=new.email_revision) then raise exception 'consent_verification_required';end if;
  if new.notice_version is distinct from (select privacy_notice_version from public.recruitment_intake_forms where id=c.form_id)
  and not(new.action='withdraw' and exists(select 1 from public.recruitment_consent_events where case_id=c.id and notice_version=new.notice_version and action in ('affirm','renew'))) then raise exception 'consent_notice_mismatch';end if;
  if new.purpose='talent_pool' and new.action in ('affirm','renew') and new.expires_at is distinct from (((new.recorded_at at time zone 'Africa/Johannesburg')+interval '12 months') at time zone 'Africa/Johannesburg') then raise exception 'consent_expiry_mismatch';end if;
 elsif tg_table_name='recruitment_case_challenges' then
  if tg_op='UPDATE' and old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then raise exception 'case_proof_already_consumed';end if;
  if tg_op='UPDATE' and (new.secret_hash,new.case_id,new.actor_id,new.session_hash,new.request_id,new.operation,new.expected_revision,new.change_id,new.payload_digest,new.created_at,new.expires_at)
   is distinct from (old.secret_hash,old.case_id,old.actor_id,old.session_hash,old.request_id,old.operation,old.expected_revision,old.change_id,old.payload_digest,old.created_at,old.expires_at) then raise exception 'case_challenge_immutable';end if;
  if new.change_id is not null then
   select * into b from public.recruitment_staff_change_buffers where id=new.change_id;
   if b.id is null or (b.case_id,b.actor_id,b.session_hash,b.operation,b.expected_revision,b.payload_digest) is distinct from (new.case_id,new.actor_id,new.session_hash,new.operation,new.expected_revision,new.payload_digest)
   or (new.consumed_at is null and b.consumed_at is not null) or b.expires_at<new.expires_at then raise exception 'case_challenge_mismatch';end if;
  end if;
 elsif tg_table_name='recruitment_staff_change_buffers' then
  if tg_op='UPDATE' and old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then raise exception 'case_buffer_already_consumed';end if;
  if tg_op='UPDATE' and (new.id,new.case_id,new.actor_id,new.session_hash,new.operation,new.expected_revision,new.payload,new.payload_digest,new.created_at,new.expires_at)
   is distinct from (old.id,old.case_id,old.actor_id,old.session_hash,old.operation,old.expected_revision,old.payload,old.payload_digest,old.created_at,old.expires_at) then raise exception 'case_buffer_immutable';end if;
 elsif tg_table_name in ('recruitment_case_requests','recruitment_case_audit') then
  if new.actor_kind='staff' and not exists(select 1 from public.recruitment_staff where user_id=new.actor_id) then raise exception 'case_staff_actor_required';end if;
  if tg_table_name='recruitment_case_requests' and tg_op='UPDATE' then
   if (new.case_id,new.actor_kind,new.actor_id,new.request_id,new.operation,new.payload_digest,new.digest_key_version,new.created_at,new.expires_at)
    is distinct from (old.case_id,old.actor_kind,old.actor_id,old.request_id,old.operation,old.payload_digest,old.digest_key_version,old.created_at,old.expires_at)
   or (old.state in ('committed','cancelled') and (new.state,new.result_ref) is distinct from (old.state,old.result_ref)) then raise exception 'case_request_immutable';end if;
  end if;
 end if;
 return new;
end$$;

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261111030000_recruitment_applicants.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261111040000_recruitment_documents_submissions.sql
-- SHA256 9ae31e46c4941be654521fcc31d99bb27a44b6ee4687efea7f6fdac2cfcb1369
-- M3.3/M3.4 private chunk quarantine, exact-byte scans and sealed submissions.
create table if not exists public.recruitment_case_documents (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 form_id uuid not null references public.recruitment_intake_forms(id), requirement_key text not null,
 generation uuid not null default gen_random_uuid(), current boolean not null default true,
 declared_name text not null check(length(declared_name) between 1 and 200), declared_size integer not null check(declared_size between 1 and 10485760),
 declared_checksum text not null check(declared_checksum ~ '^[0-9a-f]{64}$'),
 quarantine_prefix text not null unique, clean_path text unique,
 chunks jsonb not null default '{}', state text not null default 'reserved' check(state in ('reserved','uploaded','scanning','clean','rejected','scan_error','discarded','deleted')),
 checksum text check(checksum ~ '^[0-9a-f]{64}$'), actual_size integer, scan_engine text, scan_definitions text, scan_policy text,
 created_at timestamptz not null default clock_timestamp(), finalized_at timestamptz, deleted_at timestamptz,
 unique(case_id,id),unique(id,generation),
 check(jsonb_typeof(chunks)='object' and octet_length(chunks::text)<8192),
 check(state<>'clean' or (clean_path is not null and checksum=declared_checksum and actual_size=declared_size and scan_engine is not null and scan_definitions is not null and scan_policy is not null))
);
create unique index if not exists recruitment_document_current on public.recruitment_case_documents(case_id,requirement_key) where current;
create index if not exists recruitment_document_state on public.recruitment_case_documents(state,created_at);
create table if not exists public.recruitment_document_scans (
 id uuid primary key default gen_random_uuid(), document_id uuid not null, generation uuid not null,
 state text not null default 'pending' check(state in ('pending','claimed','complete','failed','cancelled')),
 claim_id uuid, lease_until timestamptz, attempts integer not null default 0 check(attempts between 0 and 5),
 available_at timestamptz not null default clock_timestamp(), verdict text check(verdict in ('clean','infected','error')),
 checksum text, engine text, definitions text, policy text, completed_at timestamptz,
 foreign key(document_id,generation) references public.recruitment_case_documents(id,generation) on delete cascade,
 unique(document_id,generation)
);
create index if not exists recruitment_scan_due on public.recruitment_document_scans(available_at,id) where state in ('pending','claimed');
create table if not exists public.recruitment_submissions (
 id uuid primary key default gen_random_uuid(), case_id uuid not null unique references public.recruitment_cases(id) on delete cascade,
 payload_id uuid not null, form_id uuid not null references public.recruitment_intake_forms(id), vacancy_id uuid, version_id uuid, publication_id uuid,
 documents jsonb not null check(jsonb_typeof(documents)='array' and jsonb_array_length(documents)<=8),
 submitted_at timestamptz not null, receipt uuid not null unique default gen_random_uuid(),
 foreign key(case_id,payload_id) references public.recruitment_case_payloads(case_id,id),
 foreign key(form_id,vacancy_id,version_id) references public.recruitment_intake_forms(id,vacancy_id,version_id),
 foreign key(vacancy_id,version_id,publication_id) references public.recruitment_vacancy_publications(vacancy_id,version_id,id)
);
drop trigger if exists recruitment_submission_immutable on public.recruitment_submissions;
create trigger recruitment_submission_immutable before update on public.recruitment_submissions for each row execute function public.recruitment_immutable();

-- No public Storage policy, upload URL, or mutable quarantine object is a clean file.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('recruitment-quarantine','recruitment-quarantine',false,2097152,array['application/octet-stream']),
 ('recruitment-documents','recruitment-documents',false,10485760,array['application/pdf']) on conflict(id) do nothing;

create or replace function public.recruitment_document_mutate(p_hash text,p_action text,d jsonb,p_digest text,p_key_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;f public.recruitment_intake_forms;doc public.recruitment_case_documents;r public.recruitment_case_requests;
 rid uuid;idx integer;bytes integer;expected integer;part jsonb;begin
 c=public.recruitment_case_session(p_hash);
 perform 1 from public.recruitment_settings where singleton for share;
 if c.vacancy_id is not null then perform 1 from public.recruitment_vacancies where id=c.vacancy_id for share;end if;
 select * into c from public.recruitment_cases where id=c.id for update;
 c=public.recruitment_case_session(p_hash,true);
 if p_action<>'discard' and not exists(select 1 from public.recruitment_settings where singleton and document_uploads_enabled and scanner_attested_at is not null and scanner_policy_version is not null) then raise exception 'scanner_unavailable';end if;
 if p_action='discard' then select * into f from public.recruitment_intake_forms where id=c.form_id;else f=public.recruitment_intake_form(c.kind,(select slug from public.recruitment_vacancies where id=c.vacancy_id));end if;
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
  if not exists(select 1 from jsonb_array_elements(f.definition->'requiredDocuments') q where q->>'key'=d->>'requirementKey') then raise exception 'invalid_request';end if;
  if (d->>'size')::integer not between 1 and 10485760 or d->>'checksum' !~ '^[0-9a-f]{64}$' then raise exception 'invalid_request';end if;
  if exists(select 1 from public.recruitment_case_documents where case_id=c.id and requirement_key=d->>'requirementKey' and current and state<>'deleted') then raise exception 'document_exists';end if;
  if (select count(*) from public.recruitment_case_documents where case_id=c.id and state<>'deleted')>=8
   or (select coalesce(sum(declared_size),0) from public.recruitment_case_documents where case_id=c.id and state<>'deleted')+(d->>'size')::integer>41943040 then raise exception 'document_quota';end if;
  insert into public.recruitment_case_documents(case_id,form_id,requirement_key,declared_name,declared_size,declared_checksum,quarantine_prefix)
  values(c.id,f.id,d->>'requirementKey',d->>'name',(d->>'size')::integer,d->>'checksum',gen_random_uuid()::text) returning * into doc;
  insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,result_ref,expires_at)
  values(c.id,'applicant',c.id,rid,'reserve',p_digest,p_key_version,'committed',doc.id,c.retention_due_at);
  perform public.recruitment_case_log(c.id,'applicant',c.id,'document_reserved',rid,p_digest);
  return jsonb_build_object('documentId',doc.id,'generation',doc.generation,'chunks',doc.chunks,'size',doc.declared_size);
 end if;
 select * into doc from public.recruitment_case_documents where id=(d->>'documentId')::uuid and case_id=c.id and generation=(d->>'generation')::uuid for update;
 if doc.id is null or doc.form_id<>c.form_id then raise exception 'case_unavailable';end if;
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

create or replace function public.recruitment_document_access(p_hash text,p_actor uuid,p_document uuid,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$declare doc public.recruitment_case_documents;c public.recruitment_cases;begin
 select * into doc from public.recruitment_case_documents where id=p_document;
 if doc.id is null or doc.state<>'clean' then raise exception 'case_unavailable';end if;
 if not exists(select 1 from public.recruitment_settings where singleton and scanner_attested_at is not null and scanner_policy_version=doc.scan_policy) then raise exception 'scanner_unavailable';end if;
 if p_actor is null then
  c=public.recruitment_case_session(p_hash);
  if c.id<>doc.case_id or c.state in ('withdrawn','expired','deletion_pending','purged') or c.retention_due_at<=clock_timestamp() then raise exception 'case_unavailable';end if;
 else
  if not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled) or not public.recruitment_case_staff_allowed(p_actor,doc.case_id,'document') then raise exception 'access_denied';end if;
  perform public.recruitment_require_assurance(p_actor,p_aal);
 end if;
 return jsonb_build_object('path',doc.clean_path,'checksum',doc.checksum,'size',doc.actual_size);
end$$;
create or replace function public.recruitment_applicant_documents(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;begin
 c=public.recruitment_case_session(p_hash);
 if c.state in ('withdrawn','expired','deletion_pending','purged') or c.retention_due_at<=clock_timestamp() then return '[]';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'generation',generation,'key',requirement_key,'name',declared_name,'size',declared_size,'checksum',declared_checksum,'state',state,'chunks',chunks) order by created_at,id) from public.recruitment_case_documents where case_id=c.id and current),'[]');
end$$;

create or replace function public.recruitment_scan_claim(p_claim uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare job public.recruitment_document_scans;doc public.recruitment_case_documents;begin
 if not exists(select 1 from public.recruitment_settings where singleton and document_uploads_enabled and scanner_attested_at is not null) then return null;end if;
 select s.* into job from public.recruitment_document_scans s join public.recruitment_case_documents d on d.id=s.document_id join public.recruitment_cases c on c.id=d.case_id
 where (s.state='pending' or (s.state='claimed' and s.lease_until<clock_timestamp())) and s.attempts<5 and s.available_at<=clock_timestamp()
 and d.current and d.state in ('uploaded','scan_error','scanning') and c.state='draft' and c.retention_due_at>clock_timestamp()
 order by s.available_at,s.id limit 1;
 if job.id is null then return null;end if;
 perform 1 from public.recruitment_settings where singleton for share;
 perform 1 from public.recruitment_vacancies where id=(select vacancy_id from public.recruitment_cases where id=(select case_id from public.recruitment_case_documents where id=job.document_id)) for share;
 perform 1 from public.recruitment_cases where id=(select case_id from public.recruitment_case_documents where id=job.document_id) and state='draft' and retention_due_at>clock_timestamp() and deletion_barrier_at is null for update skip locked;
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
 if not cfg.document_uploads_enabled or c.state<>'draft' or c.retention_due_at<=clock_timestamp() or not doc.current or doc.state<>'scanning' then
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

create or replace function public.recruitment_submit(p_hash text,d jsonb,p_digest text,p_key_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;f public.recruitment_intake_forms;r public.recruitment_case_requests;s public.recruitment_submissions;
 a jsonb;docs jsonb;pid uuid;rid uuid;t timestamptz;contact public.recruitment_case_contacts;begin
 perform public.recruitment_json_fields(d,array['requestId','expectedRevision','formId','privacyAcknowledged','poolConsent']);
 if p_digest !~ '^[0-9a-f]{64}$' or p_key_version<1 then raise exception 'invalid_request';end if;
 c=public.recruitment_case_session(p_hash);
 perform 1 from public.recruitment_settings where singleton for share;
 if c.vacancy_id is not null then perform 1 from public.recruitment_vacancies where id=c.vacancy_id for share;end if;
 select * into c from public.recruitment_cases where id=c.id for update;
 c=public.recruitment_case_session(p_hash);rid=(d->>'requestId')::uuid;
 if c.state in ('withdrawn','expired','deletion_pending','purged') or c.retention_due_at<=clock_timestamp() then raise exception 'case_unavailable';end if;
 select * into r from public.recruitment_case_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=rid;
 if r.request_id is not null then
  if r.operation<>'submit' or r.payload_digest<>p_digest or r.digest_key_version<>p_key_version then raise exception 'request_conflict';end if;
  select * into s from public.recruitment_submissions where id=r.result_ref;
  return jsonb_build_object('receipt',s.receipt,'submittedAt',s.submitted_at,'replayed',true);
 end if;
 c=public.recruitment_case_session(p_hash,true);
 f=public.recruitment_intake_form(c.kind,(select slug from public.recruitment_vacancies where id=c.vacancy_id));
 if c.revision<>(d->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 if f.id<>c.form_id or f.id<>(d->>'formId')::uuid then raise exception 'requirements_changed';end if;
 if d->'privacyAcknowledged' is distinct from 'true'::jsonb or (c.kind='talent_pool' and d->'poolConsent' is distinct from 'true'::jsonb) then raise exception 'consent_required';end if;
 select answers into a from public.recruitment_case_payloads where id=c.current_payload_id;
 if not public.recruitment_answers_valid(f.id,a,true) then raise exception 'application_incomplete';end if;
 perform 1 from public.recruitment_case_documents where case_id=c.id and current order by id for update;
 if exists(select 1 from jsonb_array_elements(f.definition->'requiredDocuments') q where (q->>'required')::boolean and not exists(select 1 from public.recruitment_case_documents x where x.case_id=c.id and x.form_id=f.id and x.current and x.requirement_key=q->>'key' and x.state='clean'))
 or exists(select 1 from public.recruitment_case_documents where case_id=c.id and current and state<>'clean') then raise exception 'documents_not_clean';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'generation',generation,'checksum',checksum,'size',actual_size,'path',clean_path) order by id),'[]') into docs from public.recruitment_case_documents where case_id=c.id and current and state='clean';
 c=public.recruitment_case_session(p_hash,true);
 f=public.recruitment_intake_form(c.kind,(select slug from public.recruitment_vacancies where id=c.vacancy_id));
 if exists(select 1 from public.recruitment_case_documents x where x.case_id=c.id and x.current and (x.scan_policy is distinct from (select scanner_policy_version from public.recruitment_settings where singleton) or not exists(select 1 from public.recruitment_settings where singleton and scanner_attested_at is not null))) then raise exception 'scanner_unavailable';end if;
 t=clock_timestamp();pid=gen_random_uuid();
 insert into public.recruitment_case_payloads(id,case_id,form_id,revision,kind,answers,sealed_at) values(pid,c.id,f.id,c.revision+1,'submitted',a,t);
 insert into public.recruitment_submissions(case_id,payload_id,form_id,vacancy_id,version_id,publication_id,documents,submitted_at) values(c.id,pid,f.id,c.vacancy_id,c.version_id,c.publication_id,docs,t) returning * into s;
 update public.recruitment_cases set state='submitted',submitted_at=t,pool_consented_at=case when kind='talent_pool' then t else null end,current_payload_id=pid,revision=revision+1 where id=c.id returning * into c;
 select * into contact from public.recruitment_case_contacts where case_id=c.id;
 if c.kind='talent_pool' then insert into public.recruitment_consent_events(case_id,purpose,action,notice_version,email_revision,recorded_at,expires_at,evidence_expires_at)
 values(c.id,'talent_pool','affirm',f.privacy_notice_version,contact.email_revision,t,c.retention_due_at,c.retention_due_at+make_interval(days=>(select case_evidence_days from public.recruitment_settings where singleton)));end if;
 insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,result_ref,expires_at)
 values(c.id,'applicant',c.id,rid,'submit',p_digest,p_key_version,'committed',s.id,c.retention_due_at);
 perform public.recruitment_case_log(c.id,'applicant',c.id,'submitted',rid,p_digest);
 insert into public.recruitment_email_outbox(case_id,template,message_key) values(c.id,'receipt','receipt:'||s.id::text);
 insert into public.recruitment_email_outbox(case_id,template,message_key,recipient_staff_id) select c.id,'staff_received','staff:'||s.id::text||':'||st.user_id::text,st.user_id from public.recruitment_staff st where public.recruitment_case_staff_allowed(st.user_id,c.id,'read');
 return jsonb_build_object('receipt',s.receipt,'submittedAt',s.submitted_at,'replayed',false);
end$$;
create or replace function public.recruitment_receipt(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;begin
 c=public.recruitment_case_session(p_hash);
 return (select jsonb_build_object('receipt',receipt,'submittedAt',submitted_at,'delivery',(select status from public.recruitment_email_outbox where message_key='receipt:'||s.id::text)) from public.recruitment_submissions s where case_id=c.id);
end$$;

do $$declare t text;begin
 foreach t in array array['recruitment_case_documents','recruitment_document_scans','recruitment_submissions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;
revoke all on function public.recruitment_document_mutate(text,text,jsonb,text,integer),public.recruitment_document_access(text,uuid,uuid,text),public.recruitment_applicant_documents(text),public.recruitment_scan_claim(uuid),public.recruitment_scan_complete(uuid,uuid,jsonb),public.recruitment_submit(text,jsonb,text,integer),public.recruitment_receipt(text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_document_mutate(text,text,jsonb,text,integer),public.recruitment_document_access(text,uuid,uuid,text),public.recruitment_applicant_documents(text),public.recruitment_scan_claim(uuid),public.recruitment_scan_complete(uuid,uuid,jsonb),public.recruitment_submit(text,jsonb,text,integer),public.recruitment_receipt(text) to service_role;

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261111040000_recruitment_documents_submissions.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261111050000_recruitment_case_operations.sql
-- SHA256 bb7615d2742a91b46c08e9d599f31f71cad5f99c365288bbe6b46fae0d9dd441
-- M3.5/M3.6 scoped human review, privacy workers and operational recovery.
alter table public.recruitment_cases
 add column if not exists deletion_requested_at timestamptz,
 add column if not exists reapply_authorized_by uuid references public.recruitment_staff(user_id),
 add column if not exists reapply_approval_ref text,
 add column if not exists reapply_expires_at timestamptz,
 add column if not exists reapply_consumed_at timestamptz;
alter table public.recruitment_consent_events add column if not exists form_id uuid references public.recruitment_intake_forms(id);
alter table public.recruitment_case_challenges drop constraint if exists recruitment_case_challenges_operation_check;
alter table public.recruitment_case_challenges add constraint recruitment_case_challenges_operation_check check(operation in ('assign','revoke_assignment','note','clarify','recommend','hold','extend_retention','resolve_conflict','reapply','declare_conflict'));
create table if not exists public.recruitment_case_notes (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 actor_id uuid references public.recruitment_staff(user_id), applicant boolean not null default false, reply_to uuid,
 kind text not null check(kind in ('note','clarify','recommend','reply')),
 content text not null check(length(btrim(content)) between 1 and 4000),
 recommendation text check(recommendation in ('progress','do_not_progress','hold')), created_at timestamptz not null default clock_timestamp(),
 unique(case_id,id),foreign key(case_id,reply_to) references public.recruitment_case_notes(case_id,id),
 check((applicant and actor_id is null and kind='reply' and reply_to is not null) or (not applicant and actor_id is not null and kind<>'reply'))
);
create index if not exists recruitment_case_notes_idx on public.recruitment_case_notes(case_id,created_at,id);
drop trigger if exists recruitment_note_immutable on public.recruitment_case_notes;
create trigger recruitment_note_immutable before update on public.recruitment_case_notes for each row execute function public.recruitment_immutable();
create table if not exists public.recruitment_deletion_jobs (
 id uuid primary key default gen_random_uuid(), case_id uuid not null unique references public.recruitment_cases(id) on delete cascade,
 phase text not null default 'pending' check(phase in ('pending','objects','pii','complete')),
 claim_id uuid, lease_until timestamptz, available_at timestamptz not null default clock_timestamp(),
 attempts integer not null default 0, error_code text, completed_at timestamptz
);
create index if not exists recruitment_deletion_due on public.recruitment_deletion_jobs(available_at,id) where phase<>'complete';
create table if not exists public.recruitment_retention_runs (
 id uuid primary key default gen_random_uuid(), started_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz, counts jsonb not null default '{}', error_code text
);
create table if not exists public.recruitment_erasure_evidence (
 case_id uuid primary key, erased_at timestamptz not null, expires_at timestamptz not null check(isfinite(expires_at)),
 last_checked_at timestamptz not null default clock_timestamp(), verified_at timestamptz,
 object_prefixes jsonb not null check(jsonb_typeof(object_prefixes)='array'), policy_version text not null
);
create index if not exists recruitment_erasure_expiry on public.recruitment_erasure_evidence(expires_at);

create or replace function public.recruitment_intake_workspace(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 perform public.recruitment_assert(p_actor,true);
 return jsonb_build_object('forms',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('binding',to_jsonb(b)) order by f.approved_at desc) from public.recruitment_intake_forms f left join public.recruitment_intake_form_bindings b on b.form_id=f.id),'[]'),
 'notices',coalesce((select jsonb_agg(to_jsonb(n) order by approved_at desc) from public.recruitment_privacy_notices n),'[]'),
 'settings',(select jsonb_build_object('ready',public.recruitment_intake_ready(),'vacancyIntake',vacancy_intake_enabled,'talentPool',talent_pool_intake_enabled,'uploads',document_uploads_enabled,'caseProcessing',case_processing_enabled,'email',applicant_email_enabled,'noticeVersion',intake_privacy_notice_version,'evidenceDays',case_evidence_days,'operationsApproved',intake_operations_approved_at is not null) from public.recruitment_settings where singleton));
end$$;
create or replace function public.recruitment_cases_read(p_actor uuid,p_case uuid default null,p_kind text default '',p_search text default '',p_after timestamptz default null,p_after_id uuid default null,p_aal text default 'aal1') returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;c public.recruitment_cases;begin
 perform public.recruitment_assert(p_actor);perform public.recruitment_require_assurance(p_actor,p_aal);
 if not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled) then return jsonb_build_object('enabled',false,'cases','[]'::jsonb);end if;
 if p_kind not in ('','vacancy','talent_pool') or length(p_search)>160 or (p_after is null)<>(p_after_id is null) then raise exception 'invalid_request';end if;
 if p_case is null then
  with permitted as materialized(select x.* from public.recruitment_cases x where public.recruitment_case_staff_allowed(p_actor,x.id,'read') and (p_kind='' or x.kind=p_kind)),
  page as(select p.id,p.reference,p.kind,p.scope_id,p.state,p.revision,p.submitted_at,p.retention_due_at,ct.normalized_email,
   pl.answers->'fields'->>'firstName' first_name,pl.answers->'fields'->>'lastName' last_name
   from permitted p join public.recruitment_case_contacts ct on ct.case_id=p.id left join public.recruitment_case_payloads pl on pl.id=p.current_payload_id
   where (p_after is null or (p.submitted_at,p.id)<(p_after,p_after_id))
   and (p_search='' or position(lower(p_search) in lower(ct.normalized_email||' '||coalesce(pl.answers->'fields'->>'firstName','')||' '||coalesce(pl.answers->'fields'->>'lastName','')))>0)
   order by p.submitted_at desc,p.id desc limit 50)
  select coalesce(jsonb_agg(to_jsonb(page) order by submitted_at desc,id desc),'[]') into result from page;
  return jsonb_build_object('enabled',true,'cases',result,'hasMore',jsonb_array_length(result)=50);
 end if;
 if not public.recruitment_case_staff_allowed(p_actor,p_case,'read') then raise exception 'access_denied';end if;
 select * into c from public.recruitment_cases where id=p_case;
 return jsonb_build_object('enabled',true,'case',to_jsonb(c),'email',(select normalized_email from public.recruitment_case_contacts where case_id=c.id),
 'form',(select definition from public.recruitment_intake_forms where id=c.form_id),'answers',(select answers from public.recruitment_case_payloads where id=c.current_payload_id),
 'notes',coalesce((select jsonb_agg(to_jsonb(n) order by created_at desc,id desc) from (select * from public.recruitment_case_notes where case_id=c.id order by created_at desc,id desc limit 50)n),'[]'),
 'notesHasMore',(select count(*)>50 from public.recruitment_case_notes where case_id=c.id),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'key',requirement_key,'name',declared_name,'size',declared_size,'state',state)) from public.recruitment_case_documents where case_id=c.id and current),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.recruitment_case_assignments a where case_id=c.id),'[]'),
 'eligibleStaff',case when (select role from public.recruitment_staff where user_id=p_actor)='officer' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',s.user_id,'email',u.email,'role',s.role)) from public.recruitment_staff s join auth.users u on u.id=s.user_id join public.recruitment_staff_scopes g on g.user_id=s.user_id and g.scope_id=c.scope_id and g.enabled
  where s.enabled and s.role in ('manager','officer') and u.email_confirmed_at is not null and not public.recruitment_case_conflicted(s.user_id,c.id) and ((select role from public.recruitment_staff where user_id=p_actor)='owner' or s.role='officer')),'[]') end,
 'holds',coalesce((select jsonb_agg(to_jsonb(h)) from public.recruitment_privacy_holds h where case_id=c.id),'[]'),
 'audit',coalesce((select jsonb_agg(to_jsonb(e) order by created_at desc,id desc) from (select * from public.recruitment_case_audit where case_id=c.id order by created_at desc,id desc limit 100)e),'[]'));
end$$;
create or replace function public.recruitment_case_action(p_actor uuid,p_case uuid,p_operation text) returns void
language plpgsql stable security definer set search_path='' as $$declare action text;begin
 perform public.recruitment_assert(p_actor);
 if p_operation not in ('hold','revoke_assignment','resolve_conflict','extend_retention') and not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled) then raise exception 'intake_disabled';end if;
 action=case p_operation when 'assign' then 'assign' when 'revoke_assignment' then 'revoke_assignment' when 'hold' then 'hold' when 'extend_retention' then 'extend_retention' when 'resolve_conflict' then 'resolve_conflict' when 'reapply' then 'resolve_conflict' else 'review' end;
 if p_operation not in ('assign','revoke_assignment','hold','extend_retention','resolve_conflict','reapply','declare_conflict','note','clarify','recommend') or not public.recruitment_case_staff_allowed(p_actor,p_case,action) then raise exception 'access_denied';end if;
end$$;
create or replace function public.recruitment_case_stage(p_actor uuid,p_session text,p_case uuid,p_revision integer,p_operation text,p_payload jsonb,p_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;new_id uuid;begin
 select * into c from public.recruitment_cases where id=p_case for update;
 perform public.recruitment_case_action(p_actor,p_case,p_operation);
 if p_operation not in ('note','clarify','recommend') or p_session !~ '^[0-9a-f]{64}$' or p_digest !~ '^[0-9a-f]{64}$' or c.revision<>p_revision then raise exception 'revision_conflict';end if;
 perform public.recruitment_json_fields(p_payload,array['text','recommendation']);
 if jsonb_typeof(p_payload->'text') is distinct from 'string' or length(btrim(p_payload->>'text')) not between 1 and 4000 or (p_operation='recommend' and p_payload->>'recommendation' not in ('progress','do_not_progress','hold')) then raise exception 'invalid_request';end if;
 insert into public.recruitment_staff_change_buffers(case_id,actor_id,session_hash,operation,expected_revision,payload,payload_digest,expires_at) values(p_case,p_actor,p_session,p_operation,p_revision,p_payload,p_digest,clock_timestamp()+interval '4 minutes') returning id into new_id;
 return jsonb_build_object('changeId',new_id,'payloadDigest',p_digest);
end$$;
create or replace function public.recruitment_case_prepare(p_actor uuid,p_old_session text,p_new_session text,p_operation text,d jsonb,p_secret text,p_digest text,p_aal text) returns jsonb
language plpgsql security definer set search_path='' as $$declare b public.recruitment_staff_change_buffers;cid uuid;expires timestamptz;begin
 perform public.recruitment_case_action(p_actor,(d->>'caseId')::uuid,p_operation);perform public.recruitment_require_assurance(p_actor,p_aal);
 if p_secret !~ '^[0-9a-f]{64}$' or p_digest !~ '^[0-9a-f]{64}$' or p_new_session !~ '^[0-9a-f]{64}$' then raise exception 'invalid_request';end if;
 if p_operation in ('note','clarify','recommend') then
  select * into b from public.recruitment_staff_change_buffers where id=(d->>'changeId')::uuid and actor_id=p_actor and session_hash=p_old_session and case_id=(d->>'caseId')::uuid and operation=p_operation and expected_revision=(d->>'expectedRevision')::integer and consumed_at is null and expires_at>clock_timestamp();
  if b.id is null or b.payload_digest<>d->>'payloadDigest' then raise exception 'case_challenge_mismatch';end if;
  expires=clock_timestamp()+interval '4 minutes';
  insert into public.recruitment_staff_change_buffers(case_id,actor_id,session_hash,operation,expected_revision,payload,payload_digest,expires_at) values(b.case_id,p_actor,p_new_session,p_operation,b.expected_revision,b.payload,b.payload_digest,expires) returning id into cid;
  d=jsonb_set(d,'{changeId}',to_jsonb(cid));
 else expires=clock_timestamp()+interval '4 minutes';end if;
 insert into public.recruitment_case_challenges(secret_hash,case_id,actor_id,session_hash,request_id,operation,expected_revision,change_id,payload_digest,expires_at)
 values(p_secret,(d->>'caseId')::uuid,p_actor,p_new_session,(d->>'requestId')::uuid,p_operation,(d->>'expectedRevision')::integer,cid,case when cid is null then p_digest else d->>'payloadDigest' end,expires);
 return jsonb_build_object('data',d);
end$$;
create or replace function public.recruitment_case_mutate(p_actor uuid,p_session text,p_operation text,d jsonb,p_proof text,p_digest text,p_key_version integer,p_aal text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;r public.recruitment_case_requests;b public.recruitment_staff_change_buffers;rid uuid=(d->>'requestId')::uuid;result_id uuid;until_date timestamptz;target uuid;begin
 perform 1 from public.recruitment_settings where singleton for share;
 perform 1 from public.recruitment_vacancies where id=(select vacancy_id from public.recruitment_cases where id=(d->>'caseId')::uuid) for share;
 select * into c from public.recruitment_cases where id=(d->>'caseId')::uuid for update;
 perform public.recruitment_case_action(p_actor,c.id,p_operation);perform public.recruitment_require_assurance(p_actor,p_aal);
 if p_digest !~ '^[0-9a-f]{64}$' or p_key_version<1 then raise exception 'invalid_request';end if;
 select * into r from public.recruitment_case_requests where case_id=c.id and actor_kind='staff' and actor_id=p_actor and request_id=rid;
 if r.request_id is not null then if r.operation<>(case when p_operation='revoke_assignment' then 'assign' else p_operation end) or r.payload_digest<>p_digest or r.digest_key_version<>p_key_version then raise exception 'request_conflict';end if;return jsonb_build_object('saved',true,'resultRef',r.result_ref,'replayed',true);end if;
 if c.revision<>(d->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 update public.recruitment_case_challenges set consumed_at=clock_timestamp() where secret_hash=p_proof and actor_id=p_actor and case_id=c.id and request_id=rid and session_hash=p_session and operation=p_operation and expected_revision=c.revision and change_id is not distinct from (d->>'changeId')::uuid and payload_digest=(case when p_operation in ('note','clarify','recommend') then d->>'payloadDigest' else p_digest end) and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'Fresh action-specific authentication is required.';end if;
 result_id=gen_random_uuid();
 if p_operation in ('note','clarify','recommend') then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','changeId','payloadDigest']);
  select * into b from public.recruitment_staff_change_buffers where id=(d->>'changeId')::uuid and actor_id=p_actor and case_id=c.id and session_hash=p_session and operation=p_operation and payload_digest=d->>'payloadDigest' and consumed_at is null and expires_at>clock_timestamp() for update;
  if b.id is null then raise exception 'case_challenge_mismatch';end if;
  insert into public.recruitment_case_notes(id,case_id,actor_id,kind,content,recommendation) values(result_id,c.id,p_actor,p_operation,b.payload->>'text',nullif(b.payload->>'recommendation',''));
  update public.recruitment_staff_change_buffers set consumed_at=clock_timestamp() where id=b.id;
  if p_operation='recommend' and c.state='submitted' then update public.recruitment_cases set state='under_review',revision=revision+1 where id=c.id returning * into c;end if;
  update public.recruitment_cases set state=case when p_operation='recommend' then 'recommendation_recorded' when state='submitted' then 'under_review' else state end,revision=revision+1 where id=c.id returning * into c;
  perform public.recruitment_case_log(c.id,'staff',p_actor,case p_operation when 'recommend' then 'recommendation_recorded' when 'clarify' then 'clarification_recorded' else 'note_recorded' end,rid,p_digest);
  if p_operation='clarify' then insert into public.recruitment_email_outbox(case_id,template,message_key) values(c.id,'clarification','clarification:'||result_id::text);end if;
 elsif p_operation in ('assign','revoke_assignment') then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','userId']);target=(d->>'userId')::uuid;
  insert into public.recruitment_case_assignments(case_id,user_id,enabled,granted_by) values(c.id,target,p_operation='assign',p_actor)
  on conflict(case_id,user_id) do update set enabled=excluded.enabled,granted_by=p_actor,revision=recruitment_case_assignments.revision+1,updated_at=clock_timestamp();
  update public.recruitment_cases set revision=revision+1 where id=c.id;
  perform public.recruitment_case_log(c.id,'staff',p_actor,'assignment_changed',rid,p_digest);
  if p_operation='assign' then insert into public.recruitment_email_outbox(case_id,template,message_key,recipient_staff_id) values(c.id,'staff_assignment','assigned:'||rid::text,target);end if;
 elsif p_operation='declare_conflict' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision']);
  insert into public.recruitment_case_conflicts(case_id,user_id,source,declared_by) values(c.id,p_actor,'declared',p_actor);
  update public.recruitment_cases set revision=revision+1 where id=c.id;
  perform public.recruitment_case_log(c.id,'staff',p_actor,'conflict_recorded',rid,p_digest);
 elsif p_operation='hold' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','holdId','release','evidenceRef','reasonCode','reviewAt']);
  if (d->>'release')::boolean then
   update public.recruitment_privacy_holds set released_by=p_actor,released_at=clock_timestamp() where id=(d->>'holdId')::uuid and case_id=c.id and released_at is null;
   if not found then raise exception 'case_unavailable';end if;
  else insert into public.recruitment_privacy_holds(case_id,purpose,reason_code,evidence_ref,placed_by,review_at) values(c.id,c.kind,d->>'reasonCode',d->>'evidenceRef',p_actor,(d->>'reviewAt')::timestamptz) returning id into result_id;end if;
  update public.recruitment_cases set revision=revision+1 where id=c.id;
  perform public.recruitment_case_log(c.id,'staff',p_actor,case when (d->>'release')::boolean then 'hold_released' else 'hold_placed' end,rid,p_digest);
 elsif p_operation='extend_retention' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','until','approvalReference']);
  until_date=(d->>'until')::timestamptz;
  update public.recruitment_cases set retention_extended_until=until_date,extension_authorized_by=p_actor,extension_approval_ref=d->>'approvalReference',revision=revision+1 where id=c.id;
  perform public.recruitment_case_log(c.id,'staff',p_actor,'retention_extended',rid,p_digest);
 elsif p_operation='resolve_conflict' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','userId','approvalReference']);
  update public.recruitment_case_conflicts set resolved_by=p_actor,resolved_at=clock_timestamp(),resolution_ref=d->>'approvalReference' where case_id=c.id and user_id=(d->>'userId')::uuid and resolved_at is null;
  if not found then raise exception 'case_unavailable';end if;
  update public.recruitment_cases set revision=revision+1 where id=c.id;
  perform public.recruitment_case_log(c.id,'staff',p_actor,'conflict_resolved',rid,p_digest);
 elsif p_operation='reapply' then
  perform public.recruitment_json_fields(d,array['requestId','caseId','expectedRevision','until','approvalReference']);
  if c.kind<>'vacancy' or c.state not in ('withdrawn','expired') or (d->>'until')::timestamptz<=clock_timestamp() or (d->>'until')::timestamptz>clock_timestamp()+interval '30 days' then raise exception 'invalid_request';end if;
  update public.recruitment_cases set reapply_authorized_by=p_actor,reapply_approval_ref=d->>'approvalReference',reapply_expires_at=(d->>'until')::timestamptz,reapply_consumed_at=null,revision=revision+1 where id=c.id;
  perform public.recruitment_case_log(c.id,'staff',p_actor,'reapplication_authorized',rid,p_digest);
 end if;
 insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,result_ref,expires_at) values(c.id,'staff',p_actor,rid,case when p_operation='revoke_assignment' then 'assign' else p_operation end,p_digest,p_key_version,'committed',result_id,greatest(c.retention_due_at,clock_timestamp())+make_interval(days=>(select case_evidence_days from public.recruitment_settings where singleton)));
 return jsonb_build_object('saved',true,'resultRef',result_id,'replayed',false);
end$$;
create or replace function public.recruitment_case_recover(p_actor uuid,p_request uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare r public.recruitment_case_requests;ch public.recruitment_case_challenges;begin
 perform public.recruitment_assert(p_actor);
 select * into r from public.recruitment_case_requests where actor_kind='staff' and actor_id=p_actor and request_id=p_request;
 if r.request_id is not null then
  if r.operation<>'declare_conflict' and not public.recruitment_case_staff_allowed(p_actor,r.case_id,'read') and not public.recruitment_case_staff_allowed(p_actor,r.case_id,'hold') and not public.recruitment_case_staff_allowed(p_actor,r.case_id,'revoke_assignment') then raise exception 'access_denied';end if;
  return jsonb_build_object('state',r.state,'caseId',r.case_id,'resultRef',r.result_ref);
 end if;
 select * into ch from public.recruitment_case_challenges where actor_id=p_actor and request_id=p_request order by expires_at desc limit 1;
 if ch.secret_hash is null then return jsonb_build_object('state','not_found','safeToReviewAgain',true);end if;
 if not public.recruitment_case_staff_allowed(p_actor,ch.case_id,'read') and not public.recruitment_case_staff_allowed(p_actor,ch.case_id,'hold') and not public.recruitment_case_staff_allowed(p_actor,ch.case_id,'revoke_assignment') then raise exception 'access_denied';end if;
 return jsonb_build_object('state','not_committed','caseId',ch.case_id,'safeToReviewAgain',ch.expires_at<clock_timestamp());
end$$;

create or replace function public.recruitment_privacy_command(p_hash text,p_action text,d jsonb,p_digest text,p_key_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;r public.recruitment_case_requests;rid uuid=(d->>'requestId')::uuid;contact public.recruitment_case_contacts;f public.recruitment_intake_forms;t timestamptz;begin
 perform public.recruitment_json_fields(d,array['requestId','expectedRevision','formId','noticeVersion','consent']);
 c=public.recruitment_case_session(p_hash);
 perform 1 from public.recruitment_settings where singleton for share;
 if c.vacancy_id is not null then perform 1 from public.recruitment_vacancies where id=c.vacancy_id for share;end if;
 select * into c from public.recruitment_cases where id=c.id for update;
 c=public.recruitment_case_session(p_hash);
 select * into r from public.recruitment_case_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=rid;
 if r.request_id is not null then if r.operation<>p_action or r.payload_digest<>p_digest or r.digest_key_version<>p_key_version then raise exception 'request_conflict';end if;return jsonb_build_object('saved',true,'state',c.state,'replayed',true);end if;
 if c.revision<>(d->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 select * into contact from public.recruitment_case_contacts where case_id=c.id;
 if p_action in ('withdraw','request_deletion') then
  if c.state='purged' then raise exception 'case_unavailable';end if;
  if p_action='withdraw' and c.state not in ('withdrawn','expired','deletion_pending') then
   update public.recruitment_cases set state='withdrawn',withdrawn_at=clock_timestamp(),revision=revision+1 where id=c.id returning * into c;
   if c.kind='talent_pool' then insert into public.recruitment_consent_events(case_id,purpose,action,notice_version,email_revision,evidence_expires_at)
    values(c.id,'talent_pool','withdraw',(select privacy_notice_version from public.recruitment_intake_forms where id=c.form_id),contact.email_revision,c.retention_due_at+make_interval(days=>(select case_evidence_days from public.recruitment_settings where singleton)));end if;
  elsif p_action='request_deletion' then
   update public.recruitment_cases set state='deletion_pending',deletion_requested_at=coalesce(deletion_requested_at,clock_timestamp()),revision=revision+1 where id=c.id returning * into c;
   insert into public.recruitment_deletion_jobs(case_id) values(c.id) on conflict do nothing;
  end if;
  update public.recruitment_applicant_sessions set revoked_at=clock_timestamp() where case_id=c.id and token_hash<>p_hash and revoked_at is null;
  update public.recruitment_applicant_sessions set kind='privacy' where case_id=c.id and token_hash=p_hash;
  update public.recruitment_email_outbox set status='cancelled',envelope=null where case_id=c.id and status in ('pending','claimed');
  update public.recruitment_document_scans set state='cancelled',claim_id=null,lease_until=null where document_id in (select id from public.recruitment_case_documents where case_id=c.id);
  perform public.recruitment_case_log(c.id,'applicant',c.id,case when p_action='withdraw' then 'withdrawn' else 'deletion_requested' end,rid,p_digest);
 elsif p_action='renew' then
  if c.kind<>'talent_pool' or c.state not in ('submitted','under_review','recommendation_recorded') or d->'consent' is distinct from 'true'::jsonb or c.retention_due_at<=clock_timestamp()
  or not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and created_at>clock_timestamp()-interval '15 minutes') then raise exception 'verification_required';end if;
  f=public.recruitment_intake_form('talent_pool',null);
  if f.id<>(d->>'formId')::uuid or f.privacy_notice_version<>d->>'noticeVersion' or not public.recruitment_answers_valid(f.id,(select answers from public.recruitment_case_payloads where id=c.current_payload_id),true) then raise exception 'requirements_changed';end if;
  t=clock_timestamp();update public.recruitment_cases set pool_consented_at=t,revision=revision+1 where id=c.id returning * into c;
  insert into public.recruitment_consent_events(case_id,purpose,action,notice_version,email_revision,recorded_at,expires_at,evidence_expires_at,form_id)
  values(c.id,'talent_pool','renew',f.privacy_notice_version,contact.email_revision,t,c.retention_due_at,c.retention_due_at+make_interval(days=>(select case_evidence_days from public.recruitment_settings where singleton)),f.id);
  perform public.recruitment_case_log(c.id,'applicant',c.id,'consent_renewed',rid,p_digest);
 else raise exception 'invalid_request';end if;
 insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,result_ref,expires_at) values(c.id,'applicant',c.id,rid,p_action,p_digest,p_key_version,'committed',c.reference,greatest(c.retention_due_at,clock_timestamp())+make_interval(days=>(select case_evidence_days from public.recruitment_settings where singleton)));
 return jsonb_build_object('saved',true,'state',c.state);
end$$;

-- Protected operational procedure: no service/browser EXECUTE grant. No flag enablement.
create or replace function public.recruitment_intake_operate(p_action text,p_operator text,p_approval text,p_reason text,p_backup_days integer default null,p_scanner_policy text default null) returns uuid
language plpgsql security definer set search_path='' as $$declare eid uuid;begin
 if length(btrim(p_operator))<3 or p_approval !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$' or length(btrim(p_reason))<10 then raise exception 'operational_authority_required';end if;
 perform 1 from public.recruitment_settings where singleton for update;
 if p_action='attest_operations' then
  if p_backup_days is null or p_backup_days not between 1 and 3650 then raise exception 'invalid_request';end if;
  update public.recruitment_settings set backup_retention_days=p_backup_days,intake_operations_approved_at=clock_timestamp(),intake_operations_approval_ref=p_approval where singleton;
 elsif p_action='attest_scanner' then
  if p_scanner_policy is null or p_scanner_policy !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$' then raise exception 'invalid_request';end if;
  update public.recruitment_settings set scanner_attested_at=clock_timestamp(),scanner_policy_version=p_scanner_policy where singleton;
 elsif p_action='revoke_scanner' then update public.recruitment_settings set document_uploads_enabled=false,scanner_attested_at=null where singleton;
 else raise exception 'invalid_request';end if;
 insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,details) values('intake:'||p_action,session_user,p_operator,p_approval,p_reason,jsonb_build_object('backupDays',p_backup_days,'scannerPolicy',p_scanner_policy)) returning id into eid;
 return eid;
end$$;

create or replace function public.recruitment_mail_claim(p_claim uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare m public.recruitment_email_outbox;mail text;body jsonb;i integer;begin
 if not exists(select 1 from public.recruitment_settings where singleton and applicant_email_enabled) then return null;end if;
 for i in 1..20 loop
 select * into m from public.recruitment_email_outbox where (status='pending' or (status='claimed' and lease_until<clock_timestamp())) and attempts<5 and expires_at>clock_timestamp() and available_at<=clock_timestamp() order by available_at,id for update skip locked limit 1;
 if m.id is null then return null;end if;
 if m.challenge_id is not null and not exists(select 1 from public.recruitment_email_challenges where id=m.challenge_id and consumed_at is null and revoked_at is null and expires_at>clock_timestamp()) then update public.recruitment_email_outbox set status='cancelled',envelope=null where id=m.id;continue;end if;
 if m.case_id is not null then
  if not exists(select 1 from public.recruitment_cases where id=m.case_id and state in ('draft','submitted','under_review','recommendation_recorded') and retention_due_at>clock_timestamp()) then update public.recruitment_email_outbox set status='cancelled',envelope=null where id=m.id;continue;end if;
  select normalized_email into mail from public.recruitment_case_contacts where case_id=m.case_id;
  if m.recipient_staff_id is not null then
   if not public.recruitment_case_staff_allowed(m.recipient_staff_id,m.case_id,'read') then update public.recruitment_email_outbox set status='cancelled',envelope=null where id=m.id;continue;end if;
   select email into mail from auth.users where id=m.recipient_staff_id and email_confirmed_at is not null;
  end if;
 end if;
 update public.recruitment_email_outbox set status='claimed',claim_id=p_claim,lease_until=clock_timestamp()+interval '1 minute',attempts=attempts+1 where id=m.id;
 body=case when m.template='receipt' then (select jsonb_build_object('receipt',receipt,'submittedAt',submitted_at) from public.recruitment_submissions where case_id=m.case_id) else '{}'::jsonb end;
 return jsonb_build_object('id',m.id,'template',m.template,'envelope',m.envelope,'to',mail,'data',body,'key',m.message_key);
 end loop;return null;
end$$;
create or replace function public.recruitment_mail_complete(p_id uuid,p_claim uuid,p_sent boolean,p_provider_ref text default null) returns void
language plpgsql security definer set search_path='' as $$begin
 update public.recruitment_email_outbox set status=case when p_sent then 'sent' when attempts>=5 or expires_at<=clock_timestamp() then 'failed' else 'pending' end,
 envelope=case when p_sent or attempts>=5 or expires_at<=clock_timestamp() then null else envelope end,
 provider_ref=case when p_provider_ref ~ '^[A-Za-z0-9_-]{1,160}$' then p_provider_ref else null end,
 error_code=case when p_sent then null else 'provider_unavailable' end,available_at=clock_timestamp()+interval '1 minute',claim_id=null,lease_until=null
 where id=p_id and claim_id=p_claim and status='claimed';
end$$;

create or replace function public.recruitment_retention_schedule() returns jsonb
language plpgsql security definer set search_path='' as $$declare run uuid;n integer;begin
 if not public.recruitment_intake_ready() then return jsonb_build_object('scheduled',0);end if;
 insert into public.recruitment_retention_runs default values returning id into run;
 insert into public.recruitment_deletion_jobs(case_id)
 select id from public.recruitment_cases where state<>'purged' and (retention_due_at<=clock_timestamp() or deletion_requested_at is not null) on conflict(case_id) do nothing;
 get diagnostics n=row_count;
 delete from public.recruitment_email_outbox where expires_at<clock_timestamp() and (lease_until is null or lease_until<clock_timestamp());
 delete from public.recruitment_email_challenges where intent_expires_at<clock_timestamp();
 delete from public.recruitment_applicant_sessions where absolute_expires_at<clock_timestamp();
 delete from public.recruitment_case_challenges where expires_at<clock_timestamp();
 delete from public.recruitment_staff_change_buffers where expires_at<clock_timestamp();
 delete from public.recruitment_intake_limits where expires_at<clock_timestamp();
 update public.recruitment_retention_runs set completed_at=clock_timestamp(),counts=jsonb_build_object('scheduled',n) where id=run;
 return jsonb_build_object('scheduled',n,'runId',run);
end$$;
create or replace function public.recruitment_deletion_claim(p_claim uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare job public.recruitment_deletion_jobs;c public.recruitment_cases;paths jsonb;begin
 if not public.recruitment_intake_ready() then return null;end if;
 perform 1 from public.recruitment_settings where singleton for share;
 select j.* into job from public.recruitment_deletion_jobs j where j.phase<>'complete' and j.available_at<=clock_timestamp() and (j.lease_until is null or j.lease_until<clock_timestamp())
 and not exists(select 1 from public.recruitment_privacy_holds where case_id=j.case_id and released_at is null)
 order by j.available_at,j.id limit 1;
 if job.id is null then return null;end if;
 perform 1 from public.recruitment_vacancies where id=(select vacancy_id from public.recruitment_cases where id=job.case_id) for share;
 select * into c from public.recruitment_cases where id=job.case_id for update skip locked;
 if c.id is null then return null;end if;
 select * into job from public.recruitment_deletion_jobs where id=job.id and phase<>'complete' and (lease_until is null or lease_until<clock_timestamp()) for update skip locked;
 if job.id is null then return null;end if;
 if exists(select 1 from public.recruitment_privacy_holds where case_id=c.id and released_at is null) then return null;end if;
 if c.retention_due_at>clock_timestamp() and c.deletion_requested_at is null then return null;end if;
 if c.state='draft' then update public.recruitment_cases set state='expired',revision=revision+1 where id=c.id;perform public.recruitment_case_log(c.id,'worker',null,'expired');end if;
 if c.state<>'deletion_pending' then update public.recruitment_cases set state='deletion_pending',revision=revision+1 where id=c.id;end if;
 update public.recruitment_applicant_sessions set kind='privacy' where case_id=c.id;
 update public.recruitment_email_challenges set revoked_at=clock_timestamp() where case_id=c.id;
 update public.recruitment_email_outbox set status='cancelled',envelope=null where case_id=c.id and status in ('pending','claimed');
 update public.recruitment_document_scans set state='cancelled',claim_id=null,lease_until=null where document_id in(select id from public.recruitment_case_documents where case_id=c.id);
 if c.deletion_barrier_at is null then
  update public.recruitment_cases set deletion_barrier_at=clock_timestamp(),revision=revision+1 where id=c.id;
  perform public.recruitment_case_log(c.id,'worker',null,'deletion_barrier');
  update public.recruitment_deletion_jobs set available_at=clock_timestamp()+interval '6 minutes' where id=job.id;return null;
 end if;
 if c.deletion_barrier_at>clock_timestamp()-interval '6 minutes' then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('quarantine',quarantine_prefix,'cleanPrefix',generation::text)),'[]') into paths from public.recruitment_case_documents where case_id=c.id;
 update public.recruitment_deletion_jobs set phase='objects',claim_id=p_claim,lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1 where id=job.id;
 return jsonb_build_object('jobId',job.id,'caseId',c.id,'prefixes',paths);
end$$;
create or replace function public.recruitment_deletion_complete(p_job uuid,p_claim uuid,p_objects_verified boolean) returns jsonb
language plpgsql security definer set search_path='' as $$declare j public.recruitment_deletion_jobs;c public.recruitment_cases;paths jsonb;cfg public.recruitment_settings;begin
 select * into cfg from public.recruitment_settings where singleton for share;
 select * into j from public.recruitment_deletion_jobs where id=p_job;
 perform 1 from public.recruitment_vacancies where id=(select vacancy_id from public.recruitment_cases where id=j.case_id) for share;
 select * into c from public.recruitment_cases where id=j.case_id for update;
 select * into j from public.recruitment_deletion_jobs where id=p_job for update;
 if j.phase<>'objects' or j.claim_id is distinct from p_claim or j.lease_until<=clock_timestamp() then raise exception 'worker_lease_expired';end if;
 if not p_objects_verified then update public.recruitment_deletion_jobs set claim_id=null,lease_until=null,error_code='storage_unverified',available_at=clock_timestamp()+interval '5 minutes' where id=j.id;return jsonb_build_object('complete',false);end if;
 if c.deletion_barrier_at is null or exists(select 1 from public.recruitment_privacy_holds where case_id=c.id and released_at is null) then raise exception 'active_privacy_hold';end if;
 select coalesce(jsonb_agg(jsonb_build_object('quarantine',quarantine_prefix,'cleanPrefix',generation::text)),'[]') into paths from public.recruitment_case_documents where case_id=c.id;
 insert into public.recruitment_erasure_evidence(case_id,erased_at,expires_at,object_prefixes,policy_version)
 values(c.id,clock_timestamp(),clock_timestamp()+make_interval(days=>greatest(cfg.case_evidence_days,cfg.backup_retention_days)),paths,cfg.intake_privacy_notice_version) on conflict(case_id) do nothing;
 delete from public.recruitment_email_outbox where case_id=c.id;
 delete from public.recruitment_email_challenges where case_id=c.id;
 delete from public.recruitment_submissions where case_id=c.id;
 update public.recruitment_cases set current_payload_id=null,revision=revision+1 where id=c.id;
 delete from public.recruitment_case_payloads where case_id=c.id;
 delete from public.recruitment_case_documents where case_id=c.id;
 delete from public.recruitment_case_notes where case_id=c.id;
 delete from public.recruitment_case_challenges where case_id=c.id;
 delete from public.recruitment_staff_change_buffers where case_id=c.id;
 delete from public.recruitment_case_requests where case_id=c.id;
 delete from public.recruitment_case_contacts where case_id=c.id;
 -- Minimal notice/version/consent proof contains no email or answers and follows
 -- the approved finite erasure-evidence/header horizon; header deletion cascades it.
 delete from public.recruitment_case_assignments where case_id=c.id;
 delete from public.recruitment_case_conflicts where case_id=c.id;
 -- Existing case audit is minimal and retained only for its approved proof period.
 update public.recruitment_cases set state='purged',purged_at=clock_timestamp(),revision=revision+1 where id=c.id;
 perform public.recruitment_case_log(c.id,'worker',null,'purged');
 update public.recruitment_deletion_jobs set phase='complete',completed_at=clock_timestamp(),claim_id=null,lease_until=null where id=j.id;
 return jsonb_build_object('complete',true);
end$$;

do $$declare t text;begin
 foreach t in array array['recruitment_case_notes','recruitment_deletion_jobs','recruitment_retention_runs','recruitment_erasure_evidence'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end$$;
revoke all on function public.recruitment_intake_workspace(uuid),public.recruitment_cases_read(uuid,uuid,text,text,timestamptz,uuid,text),public.recruitment_case_action(uuid,uuid,text),public.recruitment_case_stage(uuid,text,uuid,integer,text,jsonb,text),public.recruitment_case_prepare(uuid,text,text,text,jsonb,text,text,text),public.recruitment_case_mutate(uuid,text,text,jsonb,text,text,integer,text),public.recruitment_case_recover(uuid,uuid),public.recruitment_privacy_command(text,text,jsonb,text,integer),public.recruitment_intake_operate(text,text,text,text,integer,text),public.recruitment_mail_claim(uuid),public.recruitment_mail_complete(uuid,uuid,boolean,text),public.recruitment_retention_schedule(),public.recruitment_deletion_claim(uuid),public.recruitment_deletion_complete(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_intake_workspace(uuid),public.recruitment_cases_read(uuid,uuid,text,text,timestamptz,uuid,text),public.recruitment_case_stage(uuid,text,uuid,integer,text,jsonb,text),public.recruitment_case_prepare(uuid,text,text,text,jsonb,text,text,text),public.recruitment_case_mutate(uuid,text,text,jsonb,text,text,integer,text),public.recruitment_case_recover(uuid,uuid),public.recruitment_privacy_command(text,text,jsonb,text,integer),public.recruitment_mail_claim(uuid),public.recruitment_mail_complete(uuid,uuid,boolean,text),public.recruitment_retention_schedule(),public.recruitment_deletion_claim(uuid),public.recruitment_deletion_complete(uuid,uuid,boolean) to service_role;

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261111050000_recruitment_case_operations.sql

-- BEGIN EXACT COMMITTED SOURCE: supabase/migrations/20261111060000_recruitment_runtime_guards.sql
-- SHA256 522902502c068465f1e2b174cba11b4c3e9686e3f9b350b8e9881b50f6f8c6f9
-- M3.6 runtime boundaries, grace periods and finite erasure evidence. No rollout.
create or replace function public.recruitment_worker_settings() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('policy',scanner_policy_version,'uploads',document_uploads_enabled,'ready',public.recruitment_intake_ready()) from public.recruitment_settings where singleton
$$;
create or replace function public.recruitment_scan_promote(p_job uuid,p_claim uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_document_scans s join public.recruitment_case_documents d on d.id=s.document_id join public.recruitment_cases c on c.id=d.case_id join public.recruitment_settings cfg on cfg.singleton
 where s.id=p_job and s.claim_id=p_claim and s.state='claimed' and s.lease_until>clock_timestamp() and d.current and d.state='scanning' and c.state='draft' and c.retention_due_at>clock_timestamp() and c.deletion_barrier_at is null and cfg.document_uploads_enabled and cfg.scanner_attested_at is not null)
$$;
create or replace function public.recruitment_mail_authorize(p_id uuid,p_claim uuid) returns boolean language plpgsql stable security definer set search_path='' as $$declare m public.recruitment_email_outbox;begin
 select * into m from public.recruitment_email_outbox where id=p_id and claim_id=p_claim and status='claimed' and lease_until>clock_timestamp() and expires_at>clock_timestamp();
 if m.id is null or not exists(select 1 from public.recruitment_settings where singleton and applicant_email_enabled) then return false;end if;
 if m.challenge_id is not null and not exists(select 1 from public.recruitment_email_challenges where id=m.challenge_id and consumed_at is null and revoked_at is null and expires_at>clock_timestamp()) then return false;end if;
 if m.case_id is not null and not exists(select 1 from public.recruitment_cases where id=m.case_id and state in ('draft','submitted','under_review','recommendation_recorded') and retention_due_at>clock_timestamp()) then return false;end if;
 if m.recipient_staff_id is not null and (not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled) or not public.recruitment_case_staff_allowed(m.recipient_staff_id,m.case_id,'read')) then return false;end if;
 return true;
end$$;
create or replace function public.recruitment_erasure_manifest() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('caseId',case_id,'prefixes',object_prefixes)),'[]') from(select * from public.recruitment_erasure_evidence order by last_checked_at,case_id limit 20)e
$$;
create or replace function public.recruitment_retention_prune() returns void language plpgsql security definer set search_path='' as $$declare x record;days integer;begin
 select case_evidence_days into days from public.recruitment_settings where singleton;
 if days is null then return;end if;
 for x in select case_id from public.recruitment_erasure_evidence where expires_at<clock_timestamp() and verified_at>=expires_at and verified_at>clock_timestamp()-interval '5 minutes' order by expires_at for update skip locked limit 20 loop
  perform 1 from public.recruitment_cases where id=x.case_id for update;
  if exists(select 1 from public.recruitment_privacy_holds where case_id=x.case_id and released_at is null) then continue;end if;
  delete from public.recruitment_privacy_holds where case_id=x.case_id and released_at is not null;
  delete from public.recruitment_cases where id=x.case_id and state='purged';
  delete from public.recruitment_erasure_evidence where case_id=x.case_id;
 end loop;
 delete from public.recruitment_retention_runs where completed_at<clock_timestamp()-make_interval(days=>days);
end$$;
create or replace function public.recruitment_discarded_documents() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'prefix',quarantine_prefix,'cleanPrefix',generation::text)),'[]') from
 (select d.* from public.recruitment_case_documents d where d.state in ('discarded','rejected') and d.created_at<clock_timestamp()-interval '6 minutes'
 and not exists(select 1 from public.recruitment_document_scans s where s.document_id=d.id and s.state='claimed' and s.lease_until>clock_timestamp())
 and not exists(select 1 from public.recruitment_submissions where case_id=d.case_id) order by d.created_at,d.id limit 8)d
$$;
create or replace function public.recruitment_discard_complete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.recruitment_case_documents set state='deleted',current=false,deleted_at=clock_timestamp() where id=p_id and state in ('discarded','rejected') and created_at<clock_timestamp()-interval '6 minutes'
 and not exists(select 1 from public.recruitment_submissions where case_id=recruitment_case_documents.case_id);
end$$;
create or replace function public.recruitment_privacy_read(p_actor uuid,p_reference uuid,p_aal text default 'aal1') returns jsonb language plpgsql stable security definer set search_path='' as $$declare c public.recruitment_cases;begin
 perform public.recruitment_assert(p_actor,true);perform public.recruitment_require_assurance(p_actor,p_aal);
 select * into c from public.recruitment_cases where id=p_reference or reference=p_reference;
 if c.id is null or not public.recruitment_case_staff_allowed(p_actor,c.id,'hold') then raise exception 'access_denied';end if;
 return jsonb_build_object('id',c.id,'reference',c.reference,'state',c.state,'revision',c.revision,'retentionDue',c.retention_due_at,'holds',coalesce((select jsonb_agg(to_jsonb(h)) from public.recruitment_privacy_holds h where case_id=c.id),'[]'));
end$$;
create or replace function public.recruitment_applicant_messages(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;begin
 c=public.recruitment_case_session(p_hash);
 if c.state not in ('submitted','under_review','recommendation_recorded') or c.retention_due_at<=clock_timestamp() then return '[]';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'text',content,'replyTo',reply_to,'createdAt',created_at) order by created_at,id) from (select * from public.recruitment_case_notes where case_id=c.id and kind in ('clarify','reply') order by created_at desc,id desc limit 50)n),'[]');
end$$;
create or replace function public.recruitment_applicant_reply(p_hash text,d jsonb,p_digest text,p_key_version integer) returns jsonb language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;r public.recruitment_case_requests;rid uuid;reply uuid;begin
 perform public.recruitment_json_fields(d,array['requestId','expectedRevision','replyTo','text']);
 c=public.recruitment_case_session(p_hash);select * into c from public.recruitment_cases where id=c.id for update;
 if c.state not in ('submitted','under_review','recommendation_recorded') or c.retention_due_at<=clock_timestamp() or not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and kind='applicant' and revoked_at is null) then raise exception 'case_unavailable';end if;
 rid=(d->>'requestId')::uuid;
 select * into r from public.recruitment_case_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=rid;
 if r.request_id is not null then if r.operation<>'reply' or r.payload_digest<>p_digest or r.digest_key_version<>p_key_version then raise exception 'request_conflict';end if;return jsonb_build_object('saved',true,'replayed',true);end if;
 if c.revision<>(d->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 if length(btrim(d->>'text')) not between 1 and 4000 or not exists(select 1 from public.recruitment_case_notes where id=(d->>'replyTo')::uuid and case_id=c.id and kind='clarify') then raise exception 'invalid_request';end if;
 insert into public.recruitment_case_notes(case_id,kind,content,applicant,reply_to) values(c.id,'reply',d->>'text',true,(d->>'replyTo')::uuid) returning id into reply;
 update public.recruitment_cases set revision=revision+1 where id=c.id;
 perform public.recruitment_case_log(c.id,'applicant',c.id,'clarification_recorded',rid,p_digest);
 insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,result_ref,expires_at) values(c.id,'applicant',c.id,rid,'reply',p_digest,p_key_version,'committed',reply,c.retention_due_at);
 return jsonb_build_object('saved',true);
end$$;
create or replace function public.recruitment_reapply(p_hash text,d jsonb,p_new_session text,p_digest text,p_key_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;n public.recruitment_cases;ct public.recruitment_case_contacts;f public.recruitment_intake_forms;r public.recruitment_case_requests;pid uuid;rid uuid;begin
 perform public.recruitment_json_fields(d,array['requestId','expectedRevision','formId','noticeVersion','consent']);
 c=public.recruitment_case_session(p_hash);perform 1 from public.recruitment_settings where singleton for share;
 perform 1 from public.recruitment_vacancies where id=c.vacancy_id for share;
 select * into c from public.recruitment_cases where id=c.id for update;rid=(d->>'requestId')::uuid;
 select * into r from public.recruitment_case_requests where case_id=c.id and actor_kind='applicant' and actor_id=c.id and request_id=rid;
 if r.request_id is not null then if r.operation<>'reapply' or r.payload_digest<>p_digest or r.digest_key_version<>p_key_version then raise exception 'request_conflict';end if;return jsonb_build_object('saved',true,'issued',false,'caseReference',(select reference from public.recruitment_cases where id=r.result_ref));end if;
 if not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and created_at>clock_timestamp()-interval '15 minutes') or c.kind<>'vacancy' or c.state not in ('withdrawn','expired') or c.reapply_authorized_by is null or c.reapply_expires_at<=clock_timestamp() or c.reapply_consumed_at is not null or c.revision<>(d->>'expectedRevision')::integer then raise exception 'controlled_reapplication_required';end if;
 perform public.recruitment_assert(c.reapply_authorized_by,true);
 if public.recruitment_case_conflicted(c.reapply_authorized_by,c.id) then raise exception 'case_conflict';end if;
 f=public.recruitment_intake_form('vacancy',(select slug from public.recruitment_vacancies where id=c.vacancy_id));
 if f.id<>(d->>'formId')::uuid or f.privacy_notice_version<>d->>'noticeVersion' or d->'consent' is distinct from 'true'::jsonb then raise exception 'requirements_changed';end if;
 select * into ct from public.recruitment_case_contacts where case_id=c.id for update;pid=gen_random_uuid();
 insert into public.recruitment_cases(kind,scope_id,vacancy_id,version_id,publication_id,form_id,current_payload_id,retention_due_at)
 values('vacancy',f.scope_id,f.vacancy_id,f.version_id,(select id from public.recruitment_vacancy_publications where vacancy_id=f.vacancy_id and version_id=f.version_id order by created_at desc,id desc limit 1),f.id,pid,clock_timestamp()) returning * into n;
 insert into public.recruitment_case_contacts(case_id,kind,scope_id,vacancy_id,normalized_email,email_hmac,key_version,verified_at,reapplication_authorized_by,reapplication_approval_ref) values(n.id,n.kind,n.scope_id,n.vacancy_id,ct.normalized_email,ct.email_hmac,ct.key_version,clock_timestamp(),c.reapply_authorized_by,c.reapply_approval_ref);
 insert into public.recruitment_case_payloads(id,case_id,form_id,revision,kind,answers) values(pid,n.id,n.form_id,0,'draft','{"fields":{},"questions":{}}');
 update public.recruitment_cases set reapply_consumed_at=clock_timestamp(),revision=revision+1 where id=c.id;
 insert into public.recruitment_applicant_sessions(case_id,token_hash,email_revision,kind) values(n.id,p_new_session,1,'applicant');
 perform public.recruitment_case_log(n.id,'applicant',n.id,'case_created',rid,p_digest);
 insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,digest_key_version,state,result_ref,expires_at) values(c.id,'applicant',c.id,rid,'reapply',p_digest,p_key_version,'committed',n.id,c.retention_due_at);
 return jsonb_build_object('saved',true,'issued',true,'caseReference',n.reference);
end$$;
create or replace function public.recruitment_public_intake(p_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$declare v record;enabled boolean;result jsonb='{}';f public.recruitment_intake_forms;pool boolean=false;begin
 if coalesce(array_length(p_ids,1),0)>20 then raise exception 'invalid_request';end if;
 for v in select id,slug from public.recruitment_vacancies where id=any(p_ids) loop
  begin f=public.recruitment_intake_form('vacancy',v.slug);enabled=f.id is not null;exception when raise_exception then enabled=false;end;
  result=result||jsonb_build_object(v.id::text,enabled);
 end loop;
 begin f=public.recruitment_intake_form('talent_pool',null);pool=f.id is not null;exception when raise_exception then pool=false;end;
 return jsonb_build_object('vacancies',result,'talentPool',pool);
end$$;

revoke all on function public.recruitment_worker_settings(),public.recruitment_scan_promote(uuid,uuid),public.recruitment_mail_authorize(uuid,uuid),public.recruitment_erasure_manifest(),public.recruitment_retention_prune(),public.recruitment_discarded_documents(),public.recruitment_discard_complete(uuid),public.recruitment_privacy_read(uuid,uuid,text),public.recruitment_applicant_messages(text),public.recruitment_applicant_reply(text,jsonb,text,integer),public.recruitment_reapply(text,jsonb,text,text,integer),public.recruitment_public_intake(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_worker_settings(),public.recruitment_scan_promote(uuid,uuid),public.recruitment_mail_authorize(uuid,uuid),public.recruitment_erasure_manifest(),public.recruitment_retention_prune(),public.recruitment_discarded_documents(),public.recruitment_discard_complete(uuid),public.recruitment_privacy_read(uuid,uuid,text),public.recruitment_applicant_messages(text),public.recruitment_applicant_reply(text,jsonb,text,integer),public.recruitment_reapply(text,jsonb,text,text,integer),public.recruitment_public_intake(uuid[]) to service_role;
notify pgrst,'reload schema';

create or replace function public.recruitment_guard_case_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;b public.recruitment_staff_change_buffers;begin
 select * into c from public.recruitment_cases where id=new.case_id for update;
 if c.id is null then raise exception 'case_unavailable';end if;
 if tg_table_name='recruitment_case_payloads' then
  if new.form_id<>c.form_id and new.kind='draft' then raise exception 'payload_form_mismatch';end if;
  if tg_op='UPDATE' and (old.kind<>'draft' or new.case_id<>old.case_id) then raise exception 'sealed_payload_immutable';end if;
  if new.kind<>'draft' and new.form_id<>c.form_id then raise exception 'payload_form_mismatch';end if;
 elsif tg_table_name='recruitment_case_assignments' then
  if tg_op='UPDATE' and (new.case_id,new.user_id) is distinct from (old.case_id,old.user_id) then raise exception 'assignment_identity_immutable';end if;
  if not public.recruitment_case_staff_allowed(new.granted_by,new.case_id,case when new.enabled then 'assign' else 'revoke_assignment' end) then raise exception 'case_access_denied';end if;
  if new.enabled and (public.recruitment_case_conflicted(new.user_id,new.case_id) or not exists(
   select 1 from public.recruitment_staff s join auth.users u on u.id=s.user_id join public.recruitment_staff_scopes g on g.user_id=s.user_id
   where s.user_id=new.user_id and s.enabled and s.role in ('manager','officer') and u.email_confirmed_at is not null and g.scope_id=c.scope_id and g.enabled)) then raise exception 'case_target_ineligible';end if;
 elsif tg_table_name='recruitment_case_conflicts' then
  if tg_op='UPDATE' and (new.case_id,new.user_id,new.source,new.declared_by,new.created_at) is distinct from (old.case_id,old.user_id,old.source,old.declared_by,old.created_at) then raise exception 'conflict_identity_immutable';end if;
  if new.resolved_at is not null then
   if not public.recruitment_case_staff_allowed(new.resolved_by,new.case_id,'resolve_conflict') or new.resolved_by=new.user_id then raise exception 'independent_authority_required';end if;
   if exists(select 1 from public.recruitment_case_contacts x join auth.users u on u.id=new.user_id where x.case_id=c.id and lower(btrim(u.email))=x.normalized_email and u.email_confirmed_at is not null) then raise exception 'current_identity_conflict';end if;
  end if;
 elsif tg_table_name='recruitment_privacy_holds' then
  if new.purpose<>c.kind then raise exception 'hold_purpose_mismatch';end if;
  if tg_op='INSERT' and not public.recruitment_case_staff_allowed(new.placed_by,new.case_id,'hold') then raise exception 'hold_authority_required';end if;
  if c.deletion_barrier_at is not null then raise exception 'deletion_barrier_crossed';end if;
  if tg_op='UPDATE' and (new.case_id,new.purpose,new.placed_by,new.evidence_ref,new.reason_code,new.placed_at) is distinct from (old.case_id,old.purpose,old.placed_by,old.evidence_ref,old.reason_code,old.placed_at) then raise exception 'hold_evidence_immutable';end if;
  if tg_op='UPDATE' and old.released_at is not null then raise exception 'released_hold_immutable';end if;
  if new.released_by is not null and not public.recruitment_case_staff_allowed(new.released_by,new.case_id,'hold') then raise exception 'hold_authority_required';end if;
 elsif tg_table_name='recruitment_consent_events' then
  if new.form_id is not null and not exists(select 1 from public.recruitment_intake_forms ff where ff.id=new.form_id and ff.purpose=c.kind and ff.scope_id=c.scope_id and (ff.id=c.form_id or (c.kind='talent_pool' and new.action='renew' and exists(select 1 from public.recruitment_intake_form_bindings where form_id=ff.id and enabled)))) then raise exception 'consent_notice_mismatch';end if;
  if (new.purpose='talent_pool')<>(c.kind='talent_pool') then raise exception 'consent_purpose_mismatch';end if;
  if not exists(select 1 from public.recruitment_case_contacts where case_id=c.id and email_revision=new.email_revision) then raise exception 'consent_verification_required';end if;
  if new.notice_version is distinct from (select privacy_notice_version from public.recruitment_intake_forms where id=coalesce(new.form_id,c.form_id))
  and not(new.action='withdraw' and exists(select 1 from public.recruitment_consent_events where case_id=c.id and notice_version=new.notice_version and action in ('affirm','renew'))) then raise exception 'consent_notice_mismatch';end if;
  if new.purpose='talent_pool' and new.action in ('affirm','renew') and new.expires_at is distinct from (((new.recorded_at at time zone 'Africa/Johannesburg')+interval '12 months') at time zone 'Africa/Johannesburg') then raise exception 'consent_expiry_mismatch';end if;
 elsif tg_table_name='recruitment_case_challenges' then
  if tg_op='UPDATE' and old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then raise exception 'case_proof_already_consumed';end if;
  if tg_op='UPDATE' and (new.secret_hash,new.case_id,new.actor_id,new.session_hash,new.request_id,new.operation,new.expected_revision,new.change_id,new.payload_digest,new.created_at,new.expires_at)
   is distinct from (old.secret_hash,old.case_id,old.actor_id,old.session_hash,old.request_id,old.operation,old.expected_revision,old.change_id,old.payload_digest,old.created_at,old.expires_at) then raise exception 'case_challenge_immutable';end if;
  if new.change_id is not null then
   select * into b from public.recruitment_staff_change_buffers where id=new.change_id;
   if b.id is null or (b.case_id,b.actor_id,b.session_hash,b.operation,b.expected_revision,b.payload_digest) is distinct from (new.case_id,new.actor_id,new.session_hash,new.operation,new.expected_revision,new.payload_digest)
   or (new.consumed_at is null and b.consumed_at is not null) or b.expires_at<new.expires_at then raise exception 'case_challenge_mismatch';end if;
  end if;
 elsif tg_table_name='recruitment_staff_change_buffers' then
  if tg_op='UPDATE' and old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then raise exception 'case_buffer_already_consumed';end if;
  if tg_op='UPDATE' and (new.id,new.case_id,new.actor_id,new.session_hash,new.operation,new.expected_revision,new.payload,new.payload_digest,new.created_at,new.expires_at)
   is distinct from (old.id,old.case_id,old.actor_id,old.session_hash,old.operation,old.expected_revision,old.payload,old.payload_digest,old.created_at,old.expires_at) then raise exception 'case_buffer_immutable';end if;
 elsif tg_table_name in ('recruitment_case_requests','recruitment_case_audit') then
  if new.actor_kind='staff' and not exists(select 1 from public.recruitment_staff where user_id=new.actor_id) then raise exception 'case_staff_actor_required';end if;
  if tg_table_name='recruitment_case_requests' and tg_op='UPDATE' then
   if (new.case_id,new.actor_kind,new.actor_id,new.request_id,new.operation,new.payload_digest,new.digest_key_version,new.created_at,new.expires_at)
    is distinct from (old.case_id,old.actor_kind,old.actor_id,old.request_id,old.operation,old.payload_digest,old.digest_key_version,old.created_at,old.expires_at)
   or (old.state in ('committed','cancelled') and (new.state,new.result_ref) is distinct from (old.state,old.result_ref)) then raise exception 'case_request_immutable';end if;
  end if;
 end if;
 return new;
end$$;

create or replace function public.recruitment_case_staff_allowed(p_actor uuid,p_case uuid,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;c public.recruitment_cases;begin
 if p_action is null or p_action not in ('read','document','review','assign','revoke_assignment','hold','extend_retention','resolve_conflict') then return false;end if;
 select r.* into s from public.recruitment_staff r join auth.users u on u.id=r.user_id
 where r.user_id=p_actor and r.enabled and u.email_confirmed_at is not null;
 select * into c from public.recruitment_cases where id=p_case;
 if s.user_id is null or c.id is null or c.state='purged' or public.recruitment_case_conflicted(p_actor,p_case) then return false;end if;
 -- Draft answers are private; ended cases retain privacy/governance purposes only.
 if p_action in ('read','document','review','assign','extend_retention')
 and c.state not in ('submitted','under_review','recommendation_recorded') then return false;end if;
 if c.state='deletion_pending' and p_action<>'revoke_assignment'
 and (p_action<>'hold' or c.deletion_barrier_at is not null) then return false;end if;
 if p_action in ('read','document','review','assign') and c.retention_due_at<=clock_timestamp() then return false;end if;
 if s.role='owner' then return true;end if;
 if p_action in ('hold','extend_retention','resolve_conflict') or not exists(select 1 from public.recruitment_settings where singleton and staff_console_enabled)
 or not exists(select 1 from public.recruitment_staff_scopes where user_id=p_actor and scope_id=c.scope_id and enabled)
 or not exists(select 1 from public.recruitment_case_assignments where case_id=p_case and user_id=p_actor and enabled) then return false;end if;
 return s.role='manager' or p_action in ('read','document','review');
end$$;

-- Only compatible requirements may carry clean bytes across an explicit form rebase.
create or replace function public.recruitment_rebase_documents(p_case uuid,p_old uuid,p_new uuid) returns void language plpgsql security definer set search_path='' as $$declare a public.recruitment_intake_forms;b public.recruitment_intake_forms;d record;begin
 select * into a from public.recruitment_intake_forms where id=p_old;select * into b from public.recruitment_intake_forms where id=p_new;
 for d in select * from public.recruitment_case_documents where case_id=p_case and current for update loop
  if a.document_policy_version=b.document_policy_version and exists(select 1 from jsonb_array_elements(a.definition->'requiredDocuments') x join jsonb_array_elements(b.definition->'requiredDocuments') y on x=y where x->>'key'=d.requirement_key) then
   update public.recruitment_case_documents set form_id=p_new where id=d.id;
  else
   update public.recruitment_case_documents set state='discarded',current=false where id=d.id;
   update public.recruitment_document_scans set state='cancelled',claim_id=null,lease_until=null where document_id=d.id;
  end if;
 end loop;
end$$;
create or replace function public.recruitment_erasure_checked(p_case uuid) returns void language sql security definer set search_path='' as $$
 update public.recruitment_erasure_evidence set last_checked_at=clock_timestamp(),verified_at=clock_timestamp() where case_id=p_case
$$;
-- Protected operator export: store signed manifests outside the database backup domain.
create or replace function public.recruitment_erasure_export(p_operator text,p_approval text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if length(btrim(p_operator))<3 or length(btrim(p_approval))<3 then raise exception 'approval_required';end if;
 insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,details) values('intake:erasure_export',session_user,p_operator,p_approval,'Backup reconciliation manifest export','{}');
 return coalesce((select jsonb_agg(to_jsonb(e)) from public.recruitment_erasure_evidence e),'[]');
end$$;
revoke all on function public.recruitment_rebase_documents(uuid,uuid,uuid),public.recruitment_erasure_checked(uuid),public.recruitment_erasure_export(text,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_erasure_checked(uuid) to service_role;

create or replace function public.recruitment_policy_read() returns jsonb language plpgsql stable security definer set search_path='' as $$declare n public.recruitment_privacy_notices;begin
 if not exists(select 1 from public.recruitment_settings where singleton and applicant_email_enabled) or not public.recruitment_intake_ready() then raise exception 'intake_disabled';end if;
 select * into n from public.recruitment_privacy_notices where version=(select intake_privacy_notice_version from public.recruitment_settings where singleton);
 return jsonb_build_object('privacyNoticeVersion',n.version,'privacyNotice',n.content);
end$$;
revoke all on function public.recruitment_policy_read() from public,anon,authenticated,service_role;
grant execute on function public.recruitment_policy_read() to service_role;

-- Composite case/form integrity remains checked at commit during explicit rebases.
alter table public.recruitment_case_documents drop constraint if exists recruitment_document_case_form;
create or replace function public.recruitment_guard_document_case() returns trigger language plpgsql security definer set search_path='' as $$declare cid uuid;begin
 if tg_table_name='recruitment_cases' then cid=new.id;else cid=new.case_id;end if;
 if exists(select 1 from public.recruitment_case_documents d join public.recruitment_cases c on c.id=d.case_id join public.recruitment_intake_forms f on f.id=d.form_id where d.case_id=cid and ((d.current and d.form_id<>c.form_id) or f.purpose<>c.kind or f.scope_id<>c.scope_id or f.vacancy_id is distinct from c.vacancy_id)) then raise exception 'document_case_mismatch';end if;
 return new;
end$$;
drop trigger if exists recruitment_document_case_check on public.recruitment_case_documents;
create constraint trigger recruitment_document_case_check after insert or update on public.recruitment_case_documents deferrable initially deferred for each row execute function public.recruitment_guard_document_case();
drop trigger if exists recruitment_case_documents_check on public.recruitment_cases;
create constraint trigger recruitment_case_documents_check after update on public.recruitment_cases deferrable initially deferred for each row execute function public.recruitment_guard_document_case();
revoke all on function public.recruitment_guard_document_case() from public,anon,authenticated,service_role;
alter table public.recruitment_submissions drop constraint if exists recruitment_submission_case_form;
alter table public.recruitment_submissions add constraint recruitment_submission_case_form foreign key(case_id,form_id) references public.recruitment_cases(id,form_id) deferrable initially deferred;
create or replace function public.recruitment_guard_email_context() returns trigger language plpgsql security definer set search_path='' as $$declare f public.recruitment_intake_forms;begin
 select * into f from public.recruitment_intake_forms where id=new.form_id;
 if f.id is null or f.purpose<>new.purpose or f.vacancy_id is distinct from new.vacancy_id or
 (new.vacancy_id is not null and not exists(select 1 from public.recruitment_vacancy_publications where id=new.publication_id and vacancy_id=f.vacancy_id and version_id=f.version_id)) or
 (new.vacancy_id is null and new.publication_id is not null) or
 (new.case_id is not null and not exists(select 1 from public.recruitment_cases where id=new.case_id and kind=f.purpose and vacancy_id is not distinct from f.vacancy_id)) then raise exception 'verification_context_mismatch';end if;
 return new;
end$$;
drop trigger if exists recruitment_email_context on public.recruitment_email_challenges;
create trigger recruitment_email_context before insert or update on public.recruitment_email_challenges for each row execute function public.recruitment_guard_email_context();
revoke all on function public.recruitment_guard_email_context() from public,anon,authenticated,service_role;

-- Database-owner-only restore barrier. Execute while the restored environment is offline.
create or replace function public.recruitment_erasure_restore(p_records jsonb,p_operator text,p_approval text) returns integer language plpgsql security definer set search_path='' as $$declare e jsonb;c public.recruitment_cases;n integer=0;begin
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>10000 or length(btrim(p_operator))<3 or length(btrim(p_approval))<3 then raise exception 'approval_required';end if;
 for e in select value from jsonb_array_elements(p_records) loop
  perform public.recruitment_json_fields(e,array['case_id','erased_at','expires_at','last_checked_at','verified_at','object_prefixes','policy_version']);
  if (e->>'expires_at')::timestamptz<=clock_timestamp() or not isfinite((e->>'expires_at')::timestamptz) then raise exception 'restore_manifest_expired';end if;
  select * into c from public.recruitment_cases where id=(e->>'case_id')::uuid for update;
  if exists(select 1 from public.recruitment_privacy_holds where case_id=c.id and released_at is null) then raise exception 'restore_hold_requires_independent_review';end if;
  if c.id is not null and c.state not in ('purged','deletion_pending') then update public.recruitment_cases set state='deletion_pending',deletion_requested_at=clock_timestamp(),revision=revision+1 where id=c.id;end if;
  if c.id is not null and c.state<>'purged' then insert into public.recruitment_deletion_jobs(case_id) values(c.id) on conflict(case_id) do update set phase='pending',claim_id=null,lease_until=null,available_at=clock_timestamp();end if;
  insert into public.recruitment_erasure_evidence(case_id,erased_at,expires_at,object_prefixes,policy_version) values((e->>'case_id')::uuid,(e->>'erased_at')::timestamptz,(e->>'expires_at')::timestamptz,e->'object_prefixes',e->>'policy_version') on conflict(case_id) do update set verified_at=null,last_checked_at=clock_timestamp();
  update public.recruitment_applicant_sessions set revoked_at=clock_timestamp() where case_id=c.id;
  n=n+1;
 end loop;
 insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,details) values('intake:erasure_restore',session_user,p_operator,p_approval,'Offline backup reconciliation',jsonb_build_object('count',n));
 return n;
end$$;
revoke all on function public.recruitment_erasure_restore(jsonb,text,text) from public,anon,authenticated,service_role;

-- Restrictive AND policy defeats a pre-existing permissive browser Storage policy
-- for these two new buckets while leaving every existing bucket's policy unchanged.
drop policy if exists recruitment_private_storage on storage.objects;
create policy recruitment_private_storage on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id not in ('recruitment-quarantine','recruitment-documents'))
 with check(bucket_id not in ('recruitment-quarantine','recruitment-documents'));

create or replace function public.recruitment_messages_page(p_hash text,p_actor uuid,p_case uuid,p_before timestamptz default null,p_before_id uuid default null,p_aal text default 'aal1') returns jsonb language plpgsql security definer set search_path='' as $$declare c public.recruitment_cases;items jsonb;n integer;begin
 if (p_before is null)<>(p_before_id is null) then raise exception 'invalid_request';end if;
 if p_actor is null then
  c=public.recruitment_case_session(p_hash);
  if c.state not in ('submitted','under_review','recommendation_recorded') or c.retention_due_at<=clock_timestamp() then return jsonb_build_object('items','[]'::jsonb,'hasMore',false);end if;
 else
  perform public.recruitment_assert(p_actor);perform public.recruitment_require_assurance(p_actor,p_aal);
  if not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled) or not public.recruitment_case_staff_allowed(p_actor,p_case,'read') then raise exception 'access_denied';end if;
  select * into c from public.recruitment_cases where id=p_case;
 end if;
 with page as(select * from public.recruitment_case_notes where case_id=c.id and (p_actor is not null or kind in ('clarify','reply')) and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 51),
 limited as(select * from page order by created_at desc,id desc limit 50)
 select (select count(*) from page),coalesce((select jsonb_agg(case when p_actor is null then jsonb_build_object('id',id,'kind',kind,'text',content,'replyTo',reply_to,'createdAt',created_at) else to_jsonb(limited) end order by created_at desc,id desc) from limited),'[]') into n,items;
 return jsonb_build_object('items',items,'hasMore',n>50);
end$$;
revoke all on function public.recruitment_messages_page(text,uuid,uuid,timestamptz,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_messages_page(text,uuid,uuid,timestamptz,uuid,text) to service_role;

-- END EXACT COMMITTED SOURCE: supabase/migrations/20261111060000_recruitment_runtime_guards.sql


-- Fail before commit if the resulting private privilege model differs.
do $package_checks$
declare bad integer;r record;sig text;begin
 select count(*) into bad from (values ('recruitment_settings'),
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
('recruitment_erasure_evidence')) expected(name)
 left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=expected.name
 where c.oid is null or c.relkind not in ('r','p') or not c.relrowsecurity;
 if bad<>0 then raise exception 'Installation failed: expected 42 RLS-enabled tables';end if;
 if (select count(*) from public.recruitment_settings)<>1 or exists(select 1 from public.recruitment_settings where
 staff_console_enabled or access_guards_enabled or access_guards_mandatory or owner_aal2_required or public_vacancies_enabled or
 vacancy_intake_enabled or talent_pool_intake_enabled or applicant_email_enabled or document_uploads_enabled or case_processing_enabled or
 case_evidence_days is not null or intake_policy_approved_at is not null or backup_retention_days is not null or scanner_attested_at is not null)
 then raise exception 'Installation must leave controls off and approvals unset';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.recruitment_settings'::regclass and conname='recruitment_m31_intake_interlock' and convalidated) then raise exception 'Missing validated M3.1 interlock';end if;
 if (select count(*) from storage.buckets)<>6 then raise exception 'Expected four preserved buckets and two new buckets';end if;
 if (select count(*) from storage.buckets where
 (id='recruitment-quarantine' and not public and file_size_limit=2097152 and allowed_mime_types=array['application/octet-stream']) or
 (id='recruitment-documents' and not public and file_size_limit=10485760 and allowed_mime_types=array['application/pdf']))<>2 then raise exception 'Unexpected recruitment bucket configuration';end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='recruitment_private_storage' and not polpermissive) then raise exception 'Missing restrictive Storage policy';end if;
 for r in select c.oid,c.relname,role.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles role
 where n.nspname='public' and c.relname~'^recruitment_' and c.relkind in('r','p') and role.rolname in('anon','authenticated','service_role') loop
  if has_table_privilege(r.rolname,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or exists(select 1 from pg_attribute a where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped and has_column_privilege(r.rolname,r.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) then raise exception 'Unexpected direct recruitment table/column access for % on %',r.rolname,r.relname;end if;
 end loop;
 for r in select c.oid,c.relname,role.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles role where n.nspname='public' and c.relname~'^recruitment_' and c.relkind='S' and role.rolname in('anon','authenticated','service_role') loop
  if has_sequence_privilege(r.rolname,r.oid,'USAGE,SELECT,UPDATE') then raise exception 'Unexpected direct recruitment sequence access for % on %',r.rolname,r.relname;end if;
 end loop;
 for r in select p.oid,p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname~'^recruitment_' and p.prokind='f' loop
  if has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('authenticated',r.oid,'EXECUTE') then raise exception 'Unexpected browser recruitment RPC execution: %',r.signature;end if;
  if has_function_privilege('service_role',r.oid,'EXECUTE') and not exists(select 1 from (values ('public.recruitment_applicant_documents(text)'),
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
('public.recruitment_worker_settings()')) permitted(signature) where to_regprocedure(permitted.signature)::oid=r.oid) then raise exception 'Unexpected service recruitment RPC execution: %',r.signature;end if;
 end loop;
 for sig in select signature from (values ('public.recruitment_applicant_documents(text)'),
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
('public.recruitment_worker_settings()')) permitted(signature) loop
  if to_regprocedure(sig) is null or not has_function_privilege('service_role',to_regprocedure(sig),'EXECUTE') then raise exception 'Missing intended service RPC: %',sig;end if;
 end loop;
 for sig in select signature from (values ('public.recruitment_bootstrap(uuid)'),
('public.recruitment_issue_challenge(uuid,text,text,jsonb,text)'),
('public.recruitment_mutate(uuid,text,jsonb,text,text)')) retired(signature) loop
  if to_regprocedure(sig) is not null then raise exception 'Obsolete recruitment overload remains: %',sig;end if;
 end loop;
 insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,details)
 values('installation_m1_m3',session_user,current_setting('viva_install.operator'),current_setting('viva_install.approval'),
 'Approved fresh recruitment installation; all intake and activation controls remain disabled',
 jsonb_build_object('sourceCommit','a1444b7596cfa062801c6a78f5037527c0bde09c','sourceSetSha256','6262989e8a7ce90ce6431e15b0c9f2923dbde84be48079dfc05b50517f6553e3','sourceMigrations','[{"order":1,"path":"supabase/migrations/20261109010000_recruitment_foundations.sql","sha256":"8fd3eb9840e655e0af7db9efcb13dd131f343f3ae4a32c19bd891d3bf90a6eb9","bytes":5077},{"order":2,"path":"supabase/migrations/20261109020000_recruitment_security_operations.sql","sha256":"3875c5d0d5fffeda8e4ea28ca1eddb77510f8692c4853030d4a91af94ea284b1","bytes":13765},{"order":3,"path":"supabase/migrations/20261109030000_recruitment_access_guards.sql","sha256":"a4f895bd26026c93125fff072a80336a634ad226e04529fabe223e01a4e4a7db","bytes":1854},{"order":4,"path":"supabase/migrations/20261109040000_recruitment_security_remediation.sql","sha256":"242292ccce6265b22186ead49be021c8c2f5f4e9f856c4181e640808690e6ed5","bytes":27241},{"order":5,"path":"supabase/migrations/20261109050000_recruitment_vacancies.sql","sha256":"f5d99995c17fcfcf481e663e18ce09b496456cdd79c8b85c860e80a5a2abf1ab","bytes":45818},{"order":6,"path":"supabase/migrations/20261111010000_recruitment_intake_foundation.sql","sha256":"77acdaff19f4a621a7e077b61d4f5e419ba9d35dc622d9fea5ae5d021233d795","bytes":48513},{"order":7,"path":"supabase/migrations/20261111020000_recruitment_intake_acceptance.sql","sha256":"a8076db574006eff3a0b21ee322479ad9821f6158713a934af767347647c5e35","bytes":12612},{"order":8,"path":"supabase/migrations/20261111030000_recruitment_applicants.sql","sha256":"4c8d6c6e6b9575320ae2bd225f2a6de8bf154dc11f70c9b76b1d6aad35301465","bytes":56833},{"order":9,"path":"supabase/migrations/20261111040000_recruitment_documents_submissions.sql","sha256":"9ae31e46c4941be654521fcc31d99bb27a44b6ee4687efea7f6fdac2cfcb1369","bytes":25927},{"order":10,"path":"supabase/migrations/20261111050000_recruitment_case_operations.sql","sha256":"bb7615d2742a91b46c08e9d599f31f71cad5f99c365288bbe6b46fae0d9dd441","bytes":42773},{"order":11,"path":"supabase/migrations/20261111060000_recruitment_runtime_guards.sql","sha256":"522902502c068465f1e2b174cba11b4c3e9686e3f9b350b8e9881b50f6f8c6f9","bytes":35255}]'::jsonb,'newTables',42,'preservedStorageBuckets',4,'projectReference',current_setting('viva_install.project_reference')));
end $package_checks$;
notify pgrst,'reload schema';
commit;
