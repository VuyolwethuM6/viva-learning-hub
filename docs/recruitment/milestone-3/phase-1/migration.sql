-- REVIEW ONLY. Do not execute against production without separate approval.
begin;
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

commit;
