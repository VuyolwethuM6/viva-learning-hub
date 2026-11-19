-- M4/M5 lifecycle scheduling through the existing authenticated worker.
-- Additive; no flags, scheduler, recipient policy, or live configuration enabled.
alter table public.recruitment_email_outbox drop constraint recruitment_email_outbox_template_check;
alter table public.recruitment_email_outbox add constraint recruitment_email_outbox_template_check check(template in
 ('verify','receipt','clarification','pool_renewal','staff_received','staff_assignment','selection_status','engagement_status','interview_reminder','offer_reminder','offer_expired','onboarding_reminder'));

-- Durable deduplication survives normal outbox pruning. No message body, recipient
-- or applicant attributes are retained; entries are removed with case erasure.
create table public.recruitment_lifecycle_notifications (
 message_key text primary key,case_id uuid not null references public.recruitment_cases(id) on delete cascade,
 template text not null,queued_at timestamptz not null default clock_timestamp()
);
create index recruitment_lifecycle_notification_case on public.recruitment_lifecycle_notifications(case_id);
alter table public.recruitment_lifecycle_notifications enable row level security;
revoke all on public.recruitment_lifecycle_notifications from public,anon,authenticated,service_role;
create function public.recruitment_lifecycle_enqueue(p_case uuid,p_template text,p_key text,p_expires timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$begin
 insert into public.recruitment_lifecycle_notifications(message_key,case_id,template) values(p_key,p_case,p_template) on conflict(message_key) do nothing;
 if not found then return false;end if;
 insert into public.recruitment_email_outbox(case_id,template,message_key,expires_at) values(p_case,p_template,p_key,p_expires) on conflict(message_key) do nothing;
 return true;
end$$;
create function public.recruitment_lifecycle_erase() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.state='purged' and old.state is distinct from new.state then delete from public.recruitment_lifecycle_notifications where case_id=new.id;end if;return new;
end$$;
create trigger recruitment_lifecycle_erasure before update of state on public.recruitment_cases for each row execute function public.recruitment_lifecycle_erase();

create function public.recruitment_lifecycle_case_active(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_cases c where c.id=p_case and c.kind='vacancy'
 and c.state in ('submitted','under_review','recommendation_recorded') and c.deletion_barrier_at is null and c.retention_due_at>clock_timestamp())
$$;

-- Evaluate source state again at dispatch time; queueing a reminder grants no
-- authority to deliver it after a cancellation, replacement, withdrawal or purge.
create function public.recruitment_lifecycle_mail_current(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m public.recruitment_email_outbox; cfg public.recruitment_settings;begin
 select * into m from public.recruitment_email_outbox where id=p_id;
 select * into cfg from public.recruitment_settings where singleton;
 if m.template not in ('selection_status','engagement_status','interview_reminder','offer_reminder','offer_expired','onboarding_reminder') then return true;end if;
 if not cfg.case_processing_enabled or not public.recruitment_lifecycle_case_active(m.case_id) then return false;end if;
 if m.template in ('selection_status','interview_reminder') and not cfg.selection_enabled then return false;end if;
 if m.template in ('engagement_status','offer_reminder','offer_expired','onboarding_reminder') and not cfg.onboarding_enabled then return false;end if;
 if m.template='interview_reminder' then
  return exists(select 1 from public.recruitment_selection_interviews i where i.case_id=m.case_id and i.status='scheduled'
   and i.candidate_response is distinct from 'reschedule_requested' and i.starts_at>clock_timestamp()
   and m.message_key='interview:'||i.id::text||':'||(extract(epoch from i.starts_at)::bigint)::text||':reminder');
 elsif m.template='offer_reminder' then
  return exists(select 1 from public.recruitment_offers o join public.recruitment_offer_versions v on v.id=o.id
   where o.case_id=m.case_id and o.status='issued' and (v.terms->>'expiresAt')::timestamptz>clock_timestamp() and m.message_key='offer:'||o.id::text||':reminder');
 elsif m.template='offer_expired' then
  return exists(select 1 from public.recruitment_offers o where o.case_id=m.case_id and o.status='expired' and m.message_key='offer:'||o.id::text||':expired');
 elsif m.template='onboarding_reminder' then
  return exists(select 1 from public.recruitment_onboarding_tasks t join public.recruitment_engagement_cases e on e.case_id=t.case_id
   where t.case_id=m.case_id and t.required and t.status<>'verified' and e.onboarding_started_at is not null
   and not exists(select 1 from public.recruitment_staff_engagements a where a.case_id=t.case_id)
   and exists(select 1 from public.recruitment_offers x where x.case_id=t.case_id and x.status='accepted')
   and m.message_key='onboarding:'||t.id::text||':'||(extract(epoch from coalesce(t.due_at,e.onboarding_started_at+interval '24 hours'))::bigint)::text||':reminder');
 end if;return true;
end$$;

create or replace function public.recruitment_mail_authorize(p_id uuid,p_claim uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$declare m public.recruitment_email_outbox;begin
 select * into m from public.recruitment_email_outbox where id=p_id and claim_id=p_claim and status='claimed' and lease_until>clock_timestamp() and expires_at>clock_timestamp();
 if m.id is null or not exists(select 1 from public.recruitment_settings where singleton and applicant_email_enabled) then return false;end if;
 if m.challenge_id is not null and not exists(select 1 from public.recruitment_email_challenges where id=m.challenge_id and consumed_at is null and revoked_at is null and expires_at>clock_timestamp()) then return false;end if;
 if m.case_id is not null and not exists(select 1 from public.recruitment_cases where id=m.case_id and state in ('draft','submitted','under_review','recommendation_recorded') and deletion_barrier_at is null and retention_due_at>clock_timestamp()) then return false;end if;
 if m.recipient_staff_id is not null and (not exists(select 1 from public.recruitment_settings where singleton and case_processing_enabled) or not public.recruitment_case_staff_allowed(m.recipient_staff_id,m.case_id,'read')) then return false;end if;
 return public.recruitment_lifecycle_mail_current(p_id);
end$$;

create function public.recruitment_lifecycle_tick(p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.recruitment_settings;r record;c public.recruitment_cases;e public.recruitment_engagement_cases;o public.recruitment_offers;
 interviews integer=0;expired integer=0;offers integer=0;onboarding integer=0;begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'invalid_request';end if;
 -- Only concurrent scheduler ticks share this lock. Business commands keep their
 -- existing case -> engagement -> offer lock order.
 if not pg_try_advisory_xact_lock(hashtext('viva.recruitment.lifecycle')::bigint) then
  return jsonb_build_object('interviewsReminded',0,'offersExpired',0,'offersReminded',0,'onboardingReminded',0);end if;
 select * into cfg from public.recruitment_settings where singleton;
 if not cfg.case_processing_enabled then
  return jsonb_build_object('interviewsReminded',0,'offersExpired',0,'offersReminded',0,'onboardingReminded',0);end if;
 if cfg.onboarding_enabled then
  for r in select x.id,x.case_id from public.recruitment_offers x join public.recruitment_offer_versions v on v.id=x.id
   where x.status='issued' and (v.terms->>'expiresAt')::timestamptz<=clock_timestamp() and public.recruitment_lifecycle_case_active(x.case_id)
   order by x.id limit p_limit loop
   select * into c from public.recruitment_cases where id=r.case_id for update skip locked;
   if not found or not public.recruitment_lifecycle_case_active(c.id) then continue;end if;
   select * into e from public.recruitment_engagement_cases where case_id=c.id for update;
   select * into o from public.recruitment_offers where id=r.id for update;
   if o.status<>'issued' or not exists(select 1 from public.recruitment_offer_versions v where v.id=o.id and (v.terms->>'expiresAt')::timestamptz<=clock_timestamp()) then continue;end if;
   update public.recruitment_offers set status='expired',responded_at=clock_timestamp() where id=o.id;
   update public.recruitment_engagement_cases set revision=revision+1 where case_id=c.id returning * into e;
   insert into public.recruitment_engagement_events(case_id,actor_kind,action,revision) values(c.id,'worker','offer_expire',e.revision);
   perform public.recruitment_lifecycle_enqueue(c.id,'offer_expired','offer:'||o.id::text||':expired',clock_timestamp()+interval '24 hours');
   expired=expired+1;
  end loop;
 end if;
 -- Email switches never prevent authoritative offer deadlines from being enforced.
 if cfg.applicant_email_enabled then
  if cfg.selection_enabled then
   for r in select i.case_id,'interview:'||i.id::text||':'||(extract(epoch from i.starts_at)::bigint)::text||':reminder' as key,i.starts_at as deadline
   from public.recruitment_selection_interviews i where i.status='scheduled' and i.candidate_response is distinct from 'reschedule_requested'
   and i.starts_at>clock_timestamp() and i.starts_at<=clock_timestamp()+interval '24 hours' and public.recruitment_lifecycle_case_active(i.case_id)
   and not exists(select 1 from public.recruitment_lifecycle_notifications m where m.message_key='interview:'||i.id::text||':'||(extract(epoch from i.starts_at)::bigint)::text||':reminder')
   order by i.starts_at,i.id limit p_limit loop
    if public.recruitment_lifecycle_enqueue(r.case_id,'interview_reminder',r.key,r.deadline) then interviews=interviews+1;end if;
   end loop;
  end if;
  if cfg.onboarding_enabled then
   for r in select x.case_id,'offer:'||x.id::text||':reminder' as key,(v.terms->>'expiresAt')::timestamptz as deadline
   from public.recruitment_offers x join public.recruitment_offer_versions v on v.id=x.id where x.status='issued'
   and (v.terms->>'expiresAt')::timestamptz>clock_timestamp() and (v.terms->>'expiresAt')::timestamptz<=clock_timestamp()+interval '24 hours'
   and public.recruitment_lifecycle_case_active(x.case_id)
   and not exists(select 1 from public.recruitment_lifecycle_notifications m where m.message_key='offer:'||x.id::text||':reminder')
   order by (v.terms->>'expiresAt')::timestamptz,x.id limit p_limit loop
    if public.recruitment_lifecycle_enqueue(r.case_id,'offer_reminder',r.key,r.deadline) then offers=offers+1;end if;
   end loop;
   for r in select t.case_id,'onboarding:'||t.id::text||':'||(extract(epoch from coalesce(t.due_at,g.onboarding_started_at+interval '24 hours'))::bigint)::text||':reminder' as key
   from public.recruitment_onboarding_tasks t join public.recruitment_engagement_cases g on g.case_id=t.case_id
   where t.required and t.status<>'verified' and g.onboarding_started_at is not null
   and coalesce(t.due_at,g.onboarding_started_at+interval '24 hours')<=clock_timestamp()+interval '24 hours'
   and not exists(select 1 from public.recruitment_staff_engagements a where a.case_id=t.case_id)
   and exists(select 1 from public.recruitment_offers x where x.case_id=t.case_id and x.status='accepted')
   and public.recruitment_lifecycle_case_active(t.case_id)
   and not exists(select 1 from public.recruitment_lifecycle_notifications m where m.message_key='onboarding:'||t.id::text||':'||(extract(epoch from coalesce(t.due_at,g.onboarding_started_at+interval '24 hours'))::bigint)::text||':reminder')
   order by coalesce(t.due_at,g.onboarding_started_at+interval '24 hours'),t.id limit p_limit loop
    if public.recruitment_lifecycle_enqueue(r.case_id,'onboarding_reminder',r.key,clock_timestamp()+interval '24 hours') then onboarding=onboarding+1;end if;
   end loop;
  end if;
 end if;
 -- Withdrawn or changed reminders are cancelled, not sent using stale queue data.
 update public.recruitment_email_outbox m set status='cancelled',envelope=null,claim_id=null,lease_until=null
 where m.id in(select j.id from public.recruitment_email_outbox j where j.status in ('pending','claimed')
  and j.template in ('interview_reminder','offer_reminder','offer_expired','onboarding_reminder')
  and not public.recruitment_lifecycle_mail_current(j.id) order by j.created_at limit p_limit);
 return jsonb_build_object('interviewsReminded',interviews,'offersExpired',expired,'offersReminded',offers,'onboardingReminded',onboarding);
end$$;

revoke all on function public.recruitment_lifecycle_case_active(uuid),public.recruitment_lifecycle_mail_current(uuid),public.recruitment_lifecycle_tick(integer) from public,anon,authenticated,service_role;
revoke all on function public.recruitment_lifecycle_enqueue(uuid,text,text,timestamptz),public.recruitment_lifecycle_erase() from public,anon,authenticated,service_role;
grant execute on function public.recruitment_lifecycle_tick(integer) to service_role;

-- Scoped lifecycle reporting extends selection without exposing individual terms,
-- evaluations, bank details or private staff attributes through aggregates.
create function public.recruitment_lifecycle_summary(p_actor uuid,p_aal text) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare base jsonb;begin
 base=public.recruitment_selection_summary(p_actor,p_aal);
 if coalesce((base->>'enabled')::boolean,false)=false then return base;end if;
 return base||jsonb_build_object(
  'offersIssued',(select count(*)::integer from public.recruitment_offers o where o.issued_at is not null and public.recruitment_case_staff_allowed(p_actor,o.case_id,'read')),
  'offersAccepted',(select count(*)::integer from public.recruitment_offers o where o.status='accepted' and public.recruitment_case_staff_allowed(p_actor,o.case_id,'read')),
  'offersDeclined',(select count(*)::integer from public.recruitment_offers o where o.status='declined' and public.recruitment_case_staff_allowed(p_actor,o.case_id,'read')),
  'onboarding',(select count(*)::integer from public.recruitment_engagement_cases e where e.onboarding_started_at is not null and not exists(select 1 from public.recruitment_staff_engagements a where a.case_id=e.case_id) and public.recruitment_case_staff_allowed(p_actor,e.case_id,'read')),
  'activations',(select count(*)::integer from public.recruitment_staff_engagements a where public.recruitment_case_staff_allowed(p_actor,a.case_id,'read')),
  'onboardingProgress',coalesce((select jsonb_agg(to_jsonb(x)) from (select t.status,count(*)::integer count from public.recruitment_onboarding_tasks t where public.recruitment_case_staff_allowed(p_actor,t.case_id,'read') group by t.status)x),'[]'::jsonb),
  'screeningCompleted',(select count(*)::integer from public.recruitment_selection_cases s where public.recruitment_case_staff_allowed(p_actor,s.case_id,'read') and exists(select 1 from public.recruitment_selection_screenings x where x.id=(select last.id from public.recruitment_selection_screenings last where last.case_id=s.case_id order by last.created_at desc,last.id desc limit 1) and not exists(select 1 from jsonb_array_elements(x.checks) item where item->'complete' is distinct from 'true'::jsonb)))
 );
end$$;
revoke all on function public.recruitment_lifecycle_summary(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_lifecycle_summary(uuid,text) to service_role;


-- Replace historical hard-coded unavailable labels with authoritative switches.
-- Recorded configuration is not acceptance of real delivery, scanning or recovery.
create or replace function public.recruitment_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.recruitment_staff;begin
 s=public.recruitment_assert(p_actor);
 return jsonb_build_object('user',public.recruitment_context(p_actor),'settings',(select to_jsonb(c)-'bootstrapped_at' from public.recruitment_settings c where singleton),
 'features',(select jsonb_build_object('publicVacancies',c.public_vacancies_enabled,'talentPool',c.talent_pool_intake_enabled and public.recruitment_intake_ready(),'applications',c.vacancy_intake_enabled and public.recruitment_intake_ready(),'uploads',c.document_uploads_enabled and public.recruitment_intake_ready(),'emailDispatch',c.applicant_email_enabled,'interviews',c.selection_enabled and c.case_processing_enabled,'decisions',c.selection_enabled and c.case_processing_enabled,'onboarding',c.onboarding_enabled and c.case_processing_enabled,'activation',c.activation_enabled and c.onboarding_enabled and c.selection_enabled and c.case_processing_enabled,'compensation',false) from public.recruitment_settings c where c.singleton),
 'staff',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('email',u.email) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id) when s.role='manager' then (select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'email',u.email,'role',r.role,'enabled',r.enabled) order by u.email),'[]') from public.recruitment_staff r join auth.users u on u.id=r.user_id where r.role='officer' and r.enabled and exists(
   select 1 from public.recruitment_staff_scopes mg join public.recruitment_staff_scopes og on og.scope_id=mg.scope_id
   where mg.user_id=p_actor and mg.enabled and og.user_id=r.user_id )) else '[]'::jsonb end,
 'scopes',(select coalesce(jsonb_agg(to_jsonb(c) order by label),'[]') from public.recruitment_scopes c where s.role='owner' or exists(select 1 from public.recruitment_staff_scopes g where g.scope_id=c.id and g.user_id=p_actor and g.enabled)),
 'grants',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from public.recruitment_staff_scopes g where s.role='owner' or g.user_id=p_actor or (s.role='manager' and exists(select 1 from public.recruitment_staff_scopes own where own.user_id=p_actor and own.scope_id=g.scope_id and own.enabled))),
 'events',case when s.role='owner' then (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]') from(select * from public.recruitment_events order by created_at desc,id limit 200)e) else '[]'::jsonb end);
end$$;
