-- Repair finalization drift without deleting files, resetting status, or resending email.
create table if not exists public.learner_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check(size_bytes>0 and size_bytes<=10485760),
  created_at timestamptz not null default now()
);
alter table public.learner_documents enable row level security;
revoke all on public.learner_documents from public,anon,authenticated;
grant all on public.learner_documents to service_role;

create or replace function public.finalize_enrollment_document(p_application_id uuid,p_mime_type text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_app public.applications%rowtype;
  v_doc public.learner_documents%rowtype;
  v_metadata jsonb;
  v_size_text text;
  v_size bigint;
  v_mime text;
  v_expected_mime text;
  v_student_number text;
begin
  select * into v_app from public.applications where id=p_application_id for update;
  if not found then raise exception 'Enrollment was not found'; end if;
  if v_app.status not in ('draft','pending_review') then
    raise exception 'This enrollment is not awaiting document completion';
  end if;
  select student_number into v_student_number from public.learners where application_id=v_app.id;
  if v_student_number is null then raise exception 'Learner number was not found'; end if;
  if v_app.report_card_path is null or v_app.report_card_name is null or v_app.report_card_size is null then
    raise exception 'Enrollment document details are missing';
  end if;
  if not exists(select 1 from storage.buckets where id='learner-documents' and not public) then
    raise exception 'The learner document bucket must be private';
  end if;
  select metadata into v_metadata from storage.objects
    where bucket_id='learner-documents' and name=v_app.report_card_path;
  if not found then raise exception 'The uploaded report card was not found'; end if;
  v_size_text=coalesce(v_metadata->>'size',v_metadata->>'contentLength',v_metadata->>'content_length');
  if v_size_text is null or v_size_text !~ '^[0-9]+$' then
    raise exception 'Storage file size could not be verified';
  end if;
  v_size=v_size_text::bigint;
  v_mime=lower(trim(split_part(coalesce(
    v_metadata->>'mimetype',v_metadata->>'contentType',
    v_metadata->>'content_type',v_metadata->>'content-type',''
  ),';',1)));
  v_expected_mime=case substring(lower(v_app.report_card_path) from '[.]([a-z0-9]+)$')
    when 'pdf' then 'application/pdf'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    when 'png' then 'image/png'
    else null end;
  if v_expected_mime is null or v_mime is distinct from v_expected_mime
     or lower(trim(p_mime_type)) is distinct from v_mime then
    raise exception 'The uploaded report card type does not match the application';
  end if;
  if v_size<=0 or v_size>10485760 or v_size<>v_app.report_card_size then
    raise exception 'The uploaded report card size does not match the application';
  end if;
  select * into v_doc from public.learner_documents where application_id=v_app.id;
  if found then
    if v_doc.document_type is distinct from 'report_card'
       or v_doc.file_name is distinct from v_app.report_card_name
       or v_doc.storage_path is distinct from v_app.report_card_path
       or v_doc.mime_type is distinct from v_mime
       or v_doc.size_bytes is distinct from v_size then
      raise exception 'Existing report card metadata differs; manual review is required';
    end if;
  else
    insert into public.learner_documents(application_id,document_type,file_name,storage_path,mime_type,size_bytes)
    values(v_app.id,'report_card',v_app.report_card_name,v_app.report_card_path,v_mime,v_size::integer)
    returning * into v_doc;
  end if;
  if v_app.status='draft' then
    update public.applications set status='pending_review' where id=v_app.id;
  end if;
  return jsonb_build_object(
    'application_id',v_app.id,
    'application_number',v_app.application_number,
    'student_number',v_student_number,
    'status','pending_review',
    'document_id',v_doc.id
  );
end $$;
revoke all on function public.finalize_enrollment_document(uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_enrollment_document(uuid,text) to service_role;
