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
