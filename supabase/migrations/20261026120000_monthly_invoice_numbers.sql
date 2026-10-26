-- Existing issued invoice numbers remain unchanged. New numbers use the tuition month.
create table if not exists public.tuition_invoice_counters (
  billing_month date primary key check(extract(day from billing_month)=1),
  last_number bigint not null check(last_number>0)
);
alter table public.tuition_invoice_counters enable row level security;
revoke all on public.tuition_invoice_counters from public,anon,authenticated;
grant all on public.tuition_invoice_counters to service_role;
-- Preserve and advance any existing counter. Do not reset sequences on a rerun.
insert into public.tuition_invoice_counters(billing_month,last_number)
select billing_month,max(substring(number from 10)::bigint)
from public.tuition_invoices
where number ~ ('^VT-' || to_char(billing_month,'YYYYMM') || '[0-9]{2,}$')
group by billing_month
on conflict(billing_month) do update set last_number=greatest(public.tuition_invoice_counters.last_number,excluded.last_number);

create or replace function public.assign_tuition_invoice_number()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_number bigint;
begin
  insert into public.tuition_invoice_counters(billing_month,last_number)
  values(new.billing_month,1)
  on conflict(billing_month) do update set last_number=public.tuition_invoice_counters.last_number+1
  returning last_number into v_number;
  new.number='VT-' || to_char(new.billing_month,'YYYYMM') ||
    case when v_number<10 then '0' else '' end || v_number::text;
  return new;
end $$;
revoke all on function public.assign_tuition_invoice_number() from public,anon,authenticated;
alter table public.tuition_invoices alter column number drop default;
drop trigger if exists assign_tuition_invoice_number on public.tuition_invoices;
create trigger assign_tuition_invoice_number before insert on public.tuition_invoices
for each row execute function public.assign_tuition_invoice_number();
