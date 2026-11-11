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
