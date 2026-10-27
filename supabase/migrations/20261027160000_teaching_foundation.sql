-- Teaching release 1: private classes, sessions, resources and attendance.
do $$ begin
 if to_regprocedure('public.parent_scope(uuid)') is null then raise exception 'Apply the parent portal setup before teaching setup.'; end if;
end $$;
create table if not exists public.teaching_settings(singleton boolean primary key default true check(singleton));
insert into public.teaching_settings values(true) on conflict do nothing;
create table if not exists public.teaching_tutors(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 120),
 email text not null unique check(email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 user_id uuid unique references auth.users(id) on delete set null, enabled boolean not null default true,
 created_at timestamptz not null default now(), last_signed_in_at timestamptz
);
create table if not exists public.teaching_venues(
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 120),
 mode text not null check(mode in ('Online','In-person')), detail text not null check(length(trim(detail)) between 3 and 1000),
 active boolean not null default true, check(mode<>'Online' or detail ~ '^https://[^[:space:]]+$')
);
create table if not exists public.teaching_topics(
 id uuid primary key default gen_random_uuid(), grade text not null references public.tuition_programmes(grade),
 subject text not null check(length(subject) between 2 and 100), title text not null check(length(trim(title)) between 2 and 160),
 goal text not null check(length(trim(goal)) between 5 and 600), active boolean not null default true,
 unique(grade,subject,title)
);
create table if not exists public.teaching_classes(
 id uuid primary key default gen_random_uuid(), name text not null, grade text not null references public.tuition_programmes(grade),
 subject text not null, group_name text not null check(group_name ~ '^[A-L]$'), season integer not null check(season between 2026 and 2100),
 tutor_id uuid not null references public.teaching_tutors(id), venue_id uuid not null references public.teaching_venues(id),
 weekdays smallint[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
 starts_at time not null, ends_at time not null, archived boolean not null default false,
 created_at timestamptz not null default now(), check(ends_at>starts_at), unique(grade,subject,group_name,season)
);
create table if not exists public.teaching_memberships(
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.teaching_classes(id), application_id uuid not null references public.applications(id),
 joined_on date not null, left_on date, unique(class_id,application_id,joined_on), check(left_on is null or left_on>=joined_on)
);
create unique index if not exists teaching_membership_current on public.teaching_memberships(class_id,application_id) where left_on is null;
create table if not exists public.teaching_sessions(
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.teaching_classes(id),
 topic_id uuid not null references public.teaching_topics(id), topic_title text not null, learning_goal text not null,
 tutor_id uuid not null references public.teaching_tutors(id), venue_name text not null, venue_detail text not null, mode text not null,
 starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 outcome text check(outcome in ('Objective covered','More practice needed','Follow-up planned')), staff_note text not null default '',
 cancel_reason text, revision integer not null default 0, created_at timestamptz not null default now(),
 check(ends_at>starts_at), check(length(staff_note)<=2000)
);
create index if not exists teaching_sessions_class on public.teaching_sessions(class_id,starts_at);
create table if not exists public.teaching_session_roster(
 session_id uuid not null references public.teaching_sessions(id), application_id uuid not null references public.applications(id),
 learner_name text not null, student_number text not null, starting_mark numeric(5,2), target_mark numeric(5,2),
 included boolean not null default true, attendance text check(attendance in ('present','late','absent','excused')),
 recorded_by uuid references auth.users(id), recorded_at timestamptz, primary key(session_id,application_id)
);
create index if not exists teaching_roster_learner on public.teaching_session_roster(application_id,session_id);
create table if not exists public.teaching_materials(
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 2 and 180),
 grade text not null references public.tuition_programmes(grade), subject text not null,
 kind text not null check(kind in ('Notes','Worksheet','Presentation','Question paper','Memorandum','Revision')),
 archived boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.teaching_material_versions(
 id uuid primary key, material_id uuid not null references public.teaching_materials(id), version integer not null check(version>0),
 file_name text not null check(length(file_name) between 1 and 200), storage_path text not null unique,
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 size_bytes integer not null check(size_bytes between 1 and 10485760), finalized_at timestamptz,
 created_at timestamptz not null default now(), unique(material_id,version)
);
create table if not exists public.teaching_class_materials(
 class_id uuid not null references public.teaching_classes(id), version_id uuid not null references public.teaching_material_versions(id),
 active boolean not null default true, primary key(class_id,version_id)
);
create table if not exists public.teaching_session_materials(
 session_id uuid not null references public.teaching_sessions(id), version_id uuid not null references public.teaching_material_versions(id),
 active boolean not null default true, primary key(session_id,version_id)
);
create table if not exists public.teaching_events(
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id), action text not null,
 class_id uuid references public.teaching_classes(id), session_id uuid references public.teaching_sessions(id),
 details jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.teaching_requests(
 id uuid primary key, actor_id uuid not null references auth.users(id), audience text not null, operation text not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('teaching-materials','teaching-materials',false,10485760,array['application/pdf','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.teaching_now() returns timestamptz language sql stable set search_path='' as $$select now()$$;
create or replace function public.tutor_signin_allowed(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teaching_tutors where email=lower(trim(p_email)) and enabled);
$$;
create or replace function public.tutor_assert(p_user uuid) returns public.teaching_tutors language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors; v_email text; v_confirmed timestamptz;
begin
 select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user;
 select * into t from public.teaching_tutors where user_id=p_user and email=v_email and enabled;
 if t.id is null or v_confirmed is null then raise exception 'Tutor access is unavailable. Contact Viva Tutorials.'; end if; return t;
end $$;
create or replace function public.tutor_bind(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.teaching_tutors; v_email text; v_confirmed timestamptz;
begin
 select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=p_user;
 if v_confirmed is null then raise exception 'Verify your tutor email before signing in.'; end if;
 select * into t from public.teaching_tutors where email=v_email and enabled for update;
 if t.id is null or (t.user_id is not null and t.user_id<>p_user) then raise exception 'Tutor access is unavailable. Contact Viva Tutorials.'; end if;
 perform set_config('viva.teaching_actor',p_user::text,true);
 update public.teaching_tutors set user_id=p_user,last_signed_in_at=now() where id=t.id;
 return jsonb_build_object('id',p_user,'email',v_email,'name',t.name);
end $$;
create or replace function public.teaching_access(p_user uuid,p_audience text,p_class uuid default null) returns void language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_tutors;
begin
 if p_audience='admin' then perform public.admin_assert(p_user);
 elsif p_audience='tutor' then
  t=public.tutor_assert(p_user);
  if p_class is not null and not exists(select 1 from public.teaching_classes where id=p_class and tutor_id=t.id and not archived) then raise exception 'This class is not assigned to you.'; end if;
 else raise exception 'Invalid teaching access.'; end if;
end $$;
create or replace function public.teaching_track_change() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; c uuid; s uuid;
begin
 if tg_op='DELETE' then raise exception 'Teaching history cannot be deleted. Archive or correct the record.'; end if;
 actor=nullif(current_setting('viva.teaching_actor',true),'')::uuid;
 if actor is null then raise exception 'Use an authorized teaching operation so its history is recorded.'; end if;
 if tg_table_name='teaching_classes' then c=new.id;
 elsif tg_table_name='teaching_sessions' then c=new.class_id; s=new.id;
 elsif tg_table_name in ('teaching_memberships','teaching_class_materials') then c=new.class_id;
 elsif tg_table_name in ('teaching_session_roster','teaching_session_materials') then s=new.session_id;select class_id into c from public.teaching_sessions where id=s;
 end if;
 insert into public.teaching_events(actor_id,action,class_id,session_id,details) values(actor,tg_table_name||':'||lower(tg_op),c,s,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;
create or replace function public.teaching_history_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Teaching audit and request history is immutable.'; end $$;
do $$ declare n text; begin
 foreach n in array array['teaching_tutors','teaching_venues','teaching_topics','teaching_classes','teaching_memberships','teaching_sessions','teaching_session_roster','teaching_materials','teaching_material_versions','teaching_class_materials','teaching_session_materials'] loop
  execute format('drop trigger if exists teaching_track on public.%I',n);
  execute format('create trigger teaching_track after insert or update or delete on public.%I for each row execute function public.teaching_track_change()',n);
 end loop;
 foreach n in array array['teaching_events','teaching_requests'] loop
  execute format('drop trigger if exists teaching_immutable on public.%I',n);
  execute format('create trigger teaching_immutable before update or delete on public.%I for each row execute function public.teaching_history_immutable()',n);
 end loop;
 foreach n in array array['teaching_settings','teaching_tutors','teaching_venues','teaching_topics','teaching_classes','teaching_memberships','teaching_sessions','teaching_session_roster','teaching_materials','teaching_material_versions','teaching_class_materials','teaching_session_materials','teaching_events','teaching_requests'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant all on public.%I to service_role',n);
 end loop;
end $$;
revoke all on function public.teaching_now(),public.tutor_signin_allowed(text),public.tutor_assert(uuid),public.tutor_bind(uuid),public.teaching_access(uuid,text,uuid),public.teaching_track_change(),public.teaching_history_immutable() from public,anon,authenticated;
grant execute on function public.tutor_signin_allowed(text),public.tutor_assert(uuid),public.tutor_bind(uuid) to service_role;
