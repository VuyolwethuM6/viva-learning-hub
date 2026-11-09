-- Review and run only in an authorized isolated test database. No identities are seeded.
begin;
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

commit;
