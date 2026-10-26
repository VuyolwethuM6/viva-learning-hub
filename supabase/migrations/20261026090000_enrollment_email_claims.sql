-- Captures the owner's previously dashboard-applied email prerequisites.
alter table public.applications add column if not exists receipt_emailed_at timestamptz;
alter table public.applications add column if not exists admin_notified_at timestamptz;
alter table public.applications add column if not exists email_last_error text;
create or replace function public.claim_enrollment_email(p_application_id uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  if p_kind = 'receipt' then
    update public.applications set receipt_emailed_at=now(), email_last_error=null
      where id=p_application_id and status='pending_review' and receipt_emailed_at is null;
  elsif p_kind = 'admin' then
    update public.applications set admin_notified_at=now(), email_last_error=null
      where id=p_application_id and status='pending_review' and admin_notified_at is null;
  else raise exception 'Invalid email kind'; end if;
  get diagnostics v_rows = row_count;
  return v_rows=1;
end $$;
create or replace function public.release_enrollment_email(p_application_id uuid, p_kind text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind = 'receipt' then
    update public.applications set receipt_emailed_at=null, email_last_error=left(coalesce(p_error,''),300) where id=p_application_id;
  elsif p_kind = 'admin' then
    update public.applications set admin_notified_at=null, email_last_error=left(coalesce(p_error,''),300) where id=p_application_id;
  else raise exception 'Invalid email kind'; end if;
end $$;
revoke all on function public.claim_enrollment_email(uuid,text), public.release_enrollment_email(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_enrollment_email(uuid,text), public.release_enrollment_email(uuid,text,text) to service_role;
