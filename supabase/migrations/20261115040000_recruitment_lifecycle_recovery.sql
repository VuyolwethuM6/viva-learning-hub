-- Transactional cancellation of an uncertain M4/M5 request after browser reload.
-- No credentials, candidate content, evaluation text or offer terms are retained.
-- Tombstones must survive delayed original requests. Applicant-linked tombstones
-- follow existing case/evidence erasure; case-free staff UUIDs are minimal staff
-- governance evidence. Do not expire them under an invented retention policy.
create table public.recruitment_lifecycle_cancellations (
 actor_kind text not null check(actor_kind in ('staff','applicant')),
 actor_id uuid not null,domain text not null check(domain in ('selection','engagement')),
 request_id uuid not null,case_id uuid references public.recruitment_cases(id) on delete cascade,
 action text not null default 'request_cancelled' check(action='request_cancelled'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_kind,actor_id,domain,request_id),
 check(actor_kind<>'applicant' or case_id=actor_id)
);
create index recruitment_lifecycle_cancel_case on public.recruitment_lifecycle_cancellations(case_id) where case_id is not null;
alter table public.recruitment_lifecycle_cancellations enable row level security;
revoke all on public.recruitment_lifecycle_cancellations from public,anon,authenticated,service_role;
create trigger recruitment_lifecycle_cancel_immutable before update on public.recruitment_lifecycle_cancellations for each row execute function public.recruitment_immutable();

-- Called ONLY from the protected existing functions. This request lock is taken
-- before their case/request locks. Cancellation either sees a committed original
-- or blocks every delayed prepare/mutate, including a request still authenticating.
create function public.recruitment_lifecycle_request_check(p_kind text,p_actor uuid,p_domain text,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 if p_kind is null or p_kind not in ('staff','applicant') or p_actor is null or p_domain is null or p_domain not in ('selection','engagement') or p_request is null then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('recruitment-lifecycle:'||p_kind||':'||p_actor::text||':'||p_domain||':'||p_request::text,0));
 if exists(select 1 from public.recruitment_lifecycle_cancellations where actor_kind=p_kind and actor_id=p_actor and domain=p_domain and request_id=p_request) then raise exception 'request_cancelled';end if;
end$$;
revoke all on function public.recruitment_lifecycle_request_check(text,uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.recruitment_lifecycle_cancel(p_domain text,p_request uuid,p_actor uuid default null,p_hash text default null,p_aal text default 'aal1') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.recruitment_cases;kind text;actor uuid;linked_case uuid;committed boolean=false;begin
 if p_domain is null or p_domain not in ('selection','engagement') or p_request is null or (p_actor is null)=(p_hash is null) then raise exception 'invalid_request';end if;
 if p_hash is not null then
  c=public.recruitment_case_session(p_hash);
  if not exists(select 1 from public.recruitment_applicant_sessions where token_hash=p_hash and public.recruitment_applicant_sessions.kind='applicant' and revoked_at is null) or c.state not in ('submitted','under_review','recommendation_recorded') or c.retention_due_at<=clock_timestamp() then raise exception 'case_unavailable';end if;
  kind='applicant';actor=c.id;linked_case=c.id;
 else
  perform public.recruitment_assert(p_actor);perform public.recruitment_require_assurance(p_actor,p_aal);
  kind='staff';actor=p_actor;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('recruitment-lifecycle:'||kind||':'||actor::text||':'||p_domain||':'||p_request::text,0));
 -- Only operation metadata is returned. Lost case scopes cannot reveal result
 -- records, offer IDs, applicant data or otherwise grant review authority.
 if p_domain='selection' then
  select case_id into linked_case from public.recruitment_selection_requests where actor_id=actor and request_id=p_request and (kind='staff' or case_id=c.id);
  committed=found;
  if not committed and kind='staff' then select case_id into linked_case from public.recruitment_selection_confirmations where actor_id=actor and request_id=p_request order by expires_at desc limit 1;end if;
 else
  select case_id into linked_case from public.recruitment_engagement_requests where actor_kind=kind and actor_id=actor and request_id=p_request and (kind='staff' or case_id=c.id) order by created_at limit 1;
  committed=found;
 end if;
 if committed then return jsonb_build_object('state','committed');end if;
 if kind='applicant' then linked_case=c.id;end if;
 insert into public.recruitment_lifecycle_cancellations(actor_kind,actor_id,domain,request_id,case_id) values(kind,actor,p_domain,p_request,linked_case) on conflict do nothing;
 -- A cancelled proof may no longer be used. Delayed prepares also check the
 -- durable tombstone, so deletion here is neither the sole fence nor a timeout.
 if p_domain='selection' and kind='staff' then delete from public.recruitment_selection_confirmations where actor_id=actor and request_id=p_request;end if;
 return jsonb_build_object('state','cancelled');
end$$;
revoke all on function public.recruitment_lifecycle_cancel(text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_lifecycle_cancel(text,uuid,uuid,text,text) to service_role;

-- Guarded additive wrapping preserves every existing authorisation, feature,
-- revision, assurance, evidence and state-machine check verbatim. No renames or
-- obsolete privileged overloads are introduced. Refuse unsupported definitions.
do $recovery_guards$
declare signature text;source text;definition text;injection text;marker text;at_begin integer;begin
 for signature,injection,marker in select * from (values
 ('public.recruitment_selection_prepare(uuid,uuid,text,jsonb,text,text,text)',
  'perform public.recruitment_lifecycle_request_check(''staff'',p_actor,''selection'',(d->>''requestId'')::uuid);',
  'perform public.recruitment_selection_assert'),
 ('public.recruitment_selection_mutate(uuid,uuid,text,jsonb,text,text,text)',
  'perform public.recruitment_lifecycle_request_check(''staff'',p_actor,''selection'',(d->>''requestId'')::uuid);',
  'fresh_confirmation_required'),
 ('public.recruitment_selection_response(text,jsonb)',
  'perform public.recruitment_lifecycle_request_check(''applicant'',(public.recruitment_case_session(p_hash)).id,''selection'',(d->>''requestId'')::uuid);',
  'interview_unavailable'),
 ('public.recruitment_engagement_mutate(uuid,text,jsonb,text)',
  'perform public.recruitment_lifecycle_request_check(''staff'',p_actor,''engagement'',(d->>''requestId'')::uuid);',
  'hiring_approval_required'),
 ('public.recruitment_engagement_applicant(text,text,jsonb)',
  'if p_action not in (''read'',''recover'') then perform public.recruitment_lifecycle_request_check(''applicant'',(public.recruitment_case_session(p_hash)).id,''engagement'',(d->>''requestId'')::uuid);end if;',
  'offer_unavailable')
 ) x(signature,injection,marker) loop
  if to_regprocedure(signature) is null then raise exception 'recovery_dependency_missing';end if;
  select p.prosrc,pg_get_functiondef(p.oid) into source,definition from pg_proc p where p.oid=to_regprocedure(signature) and p.prosecdef and coalesce(p.proconfig,'{}') @> array['search_path=""'];
  if source is null or position(marker in source)=0 or position('recruitment_lifecycle_request_check' in source)>0 then raise exception 'recovery_dependency_changed';end if;
  at_begin=position('begin' in source);
  if at_begin=0 then raise exception 'recovery_dependency_changed';end if;
  execute replace(definition,source,overlay(source placing 'begin'||chr(10)||' '||injection||chr(10) from at_begin for 5));
 end loop;
end $recovery_guards$;
