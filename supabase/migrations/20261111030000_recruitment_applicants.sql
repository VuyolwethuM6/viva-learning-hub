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
