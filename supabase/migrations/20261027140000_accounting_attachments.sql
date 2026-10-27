create or replace function public.accounting_attachment(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.accounting_attachments; v_id uuid=(p_data->>'id')::uuid; v_size integer; v_mime text; v_meta jsonb; v_extension text;
begin
  perform public.admin_assert(p_actor);
  if p_action='prepare' then
    perform public.accounting_assert(p_actor);
    v_size=(p_data->>'size')::integer; v_mime=p_data->>'mime';
    if not exists(select 1 from public.accounting_bills where id=(p_data->>'billId')::uuid) or v_id is null or v_size is null or v_size not between 1 and 10485760 or v_mime is null or v_mime not in ('application/pdf','image/jpeg','image/png') or length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Choose a supplier bill and a PDF, JPEG or PNG document up to 10 MB.'; end if;
    select * into a from public.accounting_attachments where id=v_id;
    if a.id is null then
      v_extension=case v_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end;
      insert into public.accounting_attachments(id,bill_id,name,mime,size_bytes,storage_path,actor_id)
        values(v_id,(p_data->>'billId')::uuid,p_data->>'name',v_mime,v_size,(p_data->>'billId')||'/'||v_id||'.'||v_extension,p_actor) returning * into a;
    elsif a.bill_id<>(p_data->>'billId')::uuid or a.name<>p_data->>'name' or a.mime<>v_mime or a.size_bytes<>v_size then raise exception 'This upload request was already used for a different document.';
    end if;
  elsif p_action in ('finalize','view') then
    select * into a from public.accounting_attachments where id=v_id for update;
    if a.id is null then raise exception 'Expense document not found.'; end if;
    if p_action='finalize' then
      perform public.accounting_assert(p_actor);
      if not exists(select 1 from storage.buckets where id='accounting-documents' and not public) then raise exception 'The accounting document bucket must be private.'; end if;
      select metadata into v_meta from storage.objects where bucket_id='accounting-documents' and name=a.storage_path;
      if v_meta is null or coalesce(v_meta->>'size','') !~ '^[0-9]+$' then raise exception 'The uploaded document and its size could not be verified.'; end if;
      if (v_meta->>'size')::bigint<>a.size_bytes or lower(split_part(coalesce(v_meta->>'mimetype',''),';',1))<>a.mime then raise exception 'The uploaded document does not match the expected size and type.'; end if;
      update public.accounting_attachments set finalized_at=coalesce(finalized_at,now()) where id=a.id returning * into a;
    elsif a.finalized_at is null then raise exception 'Verify the uploaded expense document before viewing it.';
    end if;
  else raise exception 'Unknown expense document action.';
  end if;
  perform public.accounting_audit(p_actor,'expense_document',jsonb_build_object('attachmentId',a.id,'billId',a.bill_id,'operation',p_action,'fileName',a.name));
  return to_jsonb(a);
end $$;
create or replace function public.accounting_scheduler_context() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',s.automation_enabled,'autoSend',s.auto_send,'actor',s.scheduler_actor,'validActor',exists(select 1 from public.admin_users where user_id=s.scheduler_actor and enabled and finance_role='owner')) from public.accounting_settings s where singleton;
$$;
create or replace function public.accounting_write_ready(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform public.accounting_assert(p_actor);
  if not exists(select 1 from public.accounting_settings where singleton) then raise exception 'Accounting setup is incomplete.'; end if;
end $$;
create or replace function public.accounting_invoice_balance_for_admin(p_actor uuid,p_invoice uuid) returns bigint
language plpgsql stable security definer set search_path='' as $$ begin
  perform public.admin_assert(p_actor);
  return public.accounting_invoice_balance(p_invoice);
end $$;
revoke all on function public.accounting_attachment(uuid,text,jsonb),public.accounting_scheduler_context() from public,anon,authenticated;
grant execute on function public.accounting_attachment(uuid,text,jsonb),public.accounting_scheduler_context() to service_role;
revoke all on function public.accounting_invoice_balance_for_admin(uuid,uuid) from public,anon,authenticated;
grant execute on function public.accounting_invoice_balance_for_admin(uuid,uuid) to service_role;
revoke all on function public.accounting_write_ready(uuid) from public,anon,authenticated;
grant execute on function public.accounting_write_ready(uuid) to service_role;
notify pgrst,'reload schema';
