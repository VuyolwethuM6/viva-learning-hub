-- REVIEW ONLY. Requires original M3.1. Separate production execution approval required.
begin;
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

commit;
