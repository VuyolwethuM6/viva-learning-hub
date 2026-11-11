-- REVIEW PACKAGE ONLY. Requires corrected M3.1 and M2 dependencies. No production execution authorized.
begin;
-- BEGIN 20261111030000_recruitment_applicants
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

-- END 20261111030000_recruitment_applicants

-- BEGIN 20261111040000_recruitment_documents_submissions
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

-- END 20261111040000_recruitment_documents_submissions

-- BEGIN 20261111050000_recruitment_case_operations
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

-- END 20261111050000_recruitment_case_operations

-- BEGIN 20261111060000_recruitment_runtime_guards
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

-- END 20261111060000_recruitment_runtime_guards

notify pgrst,'reload schema';
commit;
