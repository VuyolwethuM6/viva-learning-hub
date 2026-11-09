-- Opt-in fence: existing active identities and normal sign-in remain unchanged.
-- No activation bypass or approval-consumption operation ships in Milestone 1.
create or replace function public.recruitment_guard_access() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.recruitment_settings where singleton and access_guards_enabled) then return new;end if;
 if tg_table_name='teaching_tutors' then
  if tg_op='INSERT' then new.enabled=false;
  elsif new.enabled and (not old.enabled or new.email is distinct from old.email) then raise exception 'Owner activation with verified onboarding is not released. Tutor access cannot be enabled.';end if;
 elsif tg_table_name='admin_users' then
  if tg_op='INSERT' then
   if new.enabled then raise exception 'New administrative access requires the reviewed owner activation workflow.';end if;
  elsif new.enabled and (not old.enabled or new.user_id is distinct from old.user_id or
   (case new.finance_role when 'owner' then 3 when 'bookkeeper' then 2 else 1 end) >
   (case old.finance_role when 'owner' then 3 when 'bookkeeper' then 2 else 1 end)) then raise exception 'New administrative permissions require the reviewed owner activation workflow.';end if;
 end if;
 return new;
end$$;
drop trigger if exists recruitment_access_guard on public.teaching_tutors;
create trigger recruitment_access_guard before insert or update on public.teaching_tutors for each row execute function public.recruitment_guard_access();
drop trigger if exists recruitment_access_guard on public.admin_users;
create trigger recruitment_access_guard before insert or update on public.admin_users for each row execute function public.recruitment_guard_access();
revoke all on function public.recruitment_guard_access() from public,anon,authenticated,service_role;
