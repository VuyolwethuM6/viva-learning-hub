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
