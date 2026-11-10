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
