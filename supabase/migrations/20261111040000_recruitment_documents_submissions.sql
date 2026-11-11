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
