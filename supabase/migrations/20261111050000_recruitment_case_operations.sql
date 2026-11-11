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
