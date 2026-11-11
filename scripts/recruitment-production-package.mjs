// Artifact preparation only. Reads pinned Git blobs; NEVER connects to a database.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const sourceCommit='a1444b7596cfa062801c6a78f5037527c0bde09c';
const out='docs/recruitment/production-installation';
const check=process.argv.includes('--check');
function emit(path,content){if(check){if(readFileSync(path,'utf8')!==content)throw Error('Stale generated production artifact: '+path);}else writeFileSync(path,content);}
const names=[
 '20261109010000_recruitment_foundations.sql',
 '20261109020000_recruitment_security_operations.sql',
 '20261109030000_recruitment_access_guards.sql',
 '20261109040000_recruitment_security_remediation.sql',
 '20261109050000_recruitment_vacancies.sql',
 '20261111010000_recruitment_intake_foundation.sql',
 '20261111020000_recruitment_intake_acceptance.sql',
 '20261111030000_recruitment_applicants.sql',
 '20261111040000_recruitment_documents_submissions.sql',
 '20261111050000_recruitment_case_operations.sql',
 '20261111060000_recruitment_runtime_guards.sql'
];
const sha=b=>createHash('sha256').update(b).digest('hex');
const sources=names.map(name=>{const path='supabase/migrations/'+name;const bytes=execFileSync('git',['show',`${sourceCommit}:${path}`]);if(!readFileSync(path).equals(bytes))throw Error('Working migration differs from pinned source: '+path);return{path,name,bytes,text:bytes.toString('utf8'),sha256:sha(bytes)};});
const tables=sources.flatMap(s=>[...s.text.matchAll(/create table if not exists public\.(recruitment_\w+)/gi)].map(m=>m[1]));
if(new Set(tables).size!==42||tables.length!==42)throw Error('Expected 42 unique recruitment tables');
const service=new Set(),obsolete=new Set();
for(const s of sources){
 // M1 uses a catalog loop for its initial allowlist, not literal GRANT signatures.
 // Derive those exact signatures from its committed declarations and literal name list.
 if(s.name==='20261109020000_recruitment_security_operations.sql'){
  const policy=s.text.match(/if p\.proname in \(([^)]+)\) then execute format\('grant execute/);
  if(!policy)throw Error('Unrecognized M1 dynamic grant policy');
  const allowed=[...policy[1].matchAll(/'(recruitment_\w+)'/g)].map(m=>m[1]);
  for(const declaration of s.text.matchAll(/create or replace function public\.(recruitment_\w+)\(([\s\S]*?)\) returns/gi)){
   if(!allowed.includes(declaration[1]))continue;
   const types=declaration[2].split(',').map(arg=>{const type=arg.trim().match(/^[a-z_][a-z_0-9]*\s+([a-z_]+(?:\[\])?)/i)?.[1];if(!type)throw Error('Unsupported M1 parameter declaration');return type;});
   service.add(`public.${declaration[1]}(${types.join(',')})`);
  }
 }
 for(const m of s.text.matchAll(/(revoke all on function|grant execute on function|drop function if exists)\s+([\s\S]*?);/gi)){
 const kind=m[1].toLowerCase();const signatures=[...m[2].matchAll(/public\.(recruitment_\w+)\(([^()]*)\)/g)].map(x=>`public.${x[1]}(${x[2].replace(/\s+/g,'')})`);
 for(const signature of signatures){if(kind.startsWith('grant')){if(!/to\s+service_role\s*$/i.test(m[2]))throw Error('Unexpected function grant recipient');service.add(signature);}else{service.delete(signature);if(kind.startsWith('drop'))obsolete.add(signature);}}
}}
const sourceManifest=sources.map((s,i)=>({order:i+1,path:s.path,sha256:s.sha256,bytes:s.bytes.length}));
const sourceSetSha256=sha(JSON.stringify(sourceManifest));
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const values=arr=>arr.map(x=>'('+literal(x)+')').join(',\n');
const header=readFileSync(out+'/installer-prechecks.sql.inc','utf8');
const body=sources.map(s=>`\n-- BEGIN EXACT COMMITTED SOURCE: ${s.path}\n-- SHA256 ${s.sha256}\n${s.text}\n-- END EXACT COMMITTED SOURCE: ${s.path}\n`).join('');
const checks=`
-- Fail before commit if the resulting private privilege model differs.
do $package_checks$
declare bad integer;r record;sig text;begin
 select count(*) into bad from (values ${values(tables)}) expected(name)
 left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=expected.name
 where c.oid is null or c.relkind not in ('r','p') or not c.relrowsecurity;
 if bad<>0 then raise exception 'Installation failed: expected 42 RLS-enabled tables';end if;
 if (select count(*) from public.recruitment_settings)<>1 or exists(select 1 from public.recruitment_settings where
 staff_console_enabled or access_guards_enabled or access_guards_mandatory or owner_aal2_required or public_vacancies_enabled or
 vacancy_intake_enabled or talent_pool_intake_enabled or applicant_email_enabled or document_uploads_enabled or case_processing_enabled or
 case_evidence_days is not null or intake_policy_approved_at is not null or backup_retention_days is not null or scanner_attested_at is not null)
 then raise exception 'Installation must leave controls off and approvals unset';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.recruitment_settings'::regclass and conname='recruitment_m31_intake_interlock' and convalidated) then raise exception 'Missing validated M3.1 interlock';end if;
 if (select count(*) from storage.buckets)<>6 then raise exception 'Expected four preserved buckets and two new buckets';end if;
 if (select count(*) from storage.buckets where
 (id='recruitment-quarantine' and not public and file_size_limit=2097152 and allowed_mime_types=array['application/octet-stream']) or
 (id='recruitment-documents' and not public and file_size_limit=10485760 and allowed_mime_types=array['application/pdf']))<>2 then raise exception 'Unexpected recruitment bucket configuration';end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='recruitment_private_storage' and not polpermissive) then raise exception 'Missing restrictive Storage policy';end if;
 for r in select c.oid,c.relname,role.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles role
 where n.nspname='public' and c.relname~'^recruitment_' and c.relkind in('r','p') and role.rolname in('anon','authenticated','service_role') loop
  if has_table_privilege(r.rolname,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or exists(select 1 from pg_attribute a where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped and has_column_privilege(r.rolname,r.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) then raise exception 'Unexpected direct recruitment table/column access for % on %',r.rolname,r.relname;end if;
 end loop;
 for r in select c.oid,c.relname,role.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles role where n.nspname='public' and c.relname~'^recruitment_' and c.relkind='S' and role.rolname in('anon','authenticated','service_role') loop
  if has_sequence_privilege(r.rolname,r.oid,'USAGE,SELECT,UPDATE') then raise exception 'Unexpected direct recruitment sequence access for % on %',r.rolname,r.relname;end if;
 end loop;
 for r in select p.oid,p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname~'^recruitment_' and p.prokind='f' loop
  if has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('authenticated',r.oid,'EXECUTE') then raise exception 'Unexpected browser recruitment RPC execution: %',r.signature;end if;
  if has_function_privilege('service_role',r.oid,'EXECUTE') and not exists(select 1 from (values ${values([...service].sort())}) permitted(signature) where to_regprocedure(permitted.signature)::oid=r.oid) then raise exception 'Unexpected service recruitment RPC execution: %',r.signature;end if;
 end loop;
 for sig in select signature from (values ${values([...service].sort())}) permitted(signature) loop
  if to_regprocedure(sig) is null or not has_function_privilege('service_role',to_regprocedure(sig),'EXECUTE') then raise exception 'Missing intended service RPC: %',sig;end if;
 end loop;
 for sig in select signature from (values ${values([...obsolete].sort())}) retired(signature) loop
  if to_regprocedure(sig) is not null then raise exception 'Obsolete recruitment overload remains: %',sig;end if;
 end loop;
 insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,details)
 values('installation_m1_m3',session_user,current_setting('viva_install.operator'),current_setting('viva_install.approval'),
 'Approved fresh recruitment installation; all intake and activation controls remain disabled',
 jsonb_build_object('sourceCommit','${sourceCommit}','sourceSetSha256','${sourceSetSha256}','sourceMigrations',${literal(JSON.stringify(sourceManifest))}::jsonb,'newTables',42,'preservedStorageBuckets',4,'projectReference',current_setting('viva_install.project_reference')));
end $package_checks$;
notify pgrst,'reload schema';
commit;
`;
const installation=`-- FINAL EXECUTION-REVIEW PACKAGE. COMPATIBILITY RECONCILED; DO NOT EXECUTE WITHOUT EXACT-SCRIPT APPROVAL.\n-- SQL EDITOR ONLY; FRESH RECRUITMENT INSTALL, NOT A FULL PLATFORM SCHEMA RESET.\n-- Sources pinned to ${sourceCommit}. Original migration bytes are copied verbatim.\n-- Execute the WHOLE transaction; do not run historical intermediate migrations individually.\nbegin;\nset local lock_timeout='5s';\nset local statement_timeout='180s';\n${header}\n${body}\n${checks}`;
mkdirSync(out,{recursive:true});emit(out+'/01-install-m1-through-m3.sql',installation);
emit(out+'/expected-service-rpcs.json',JSON.stringify([...service].sort(),null,2)+'\n');
const post=`-- READ ONLY. Run SELECT blocks separately in SQL Editor. No business RPCs are invoked.\n-- Result 1: expected table/RLS inventory.\nwith expected(name) as(values ${values(tables)})\nselect e.name,c.oid is not null present,c.relkind,c.relrowsecurity,pg_get_userbyid(c.relowner) owner from expected e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name order by e.name;\n\n-- Result 2: controls; all booleans below must remain false after installation.\nselect staff_console_enabled,access_guards_enabled,access_guards_mandatory,owner_aal2_required,public_vacancies_enabled,vacancy_intake_enabled,talent_pool_intake_enabled,applicant_email_enabled,document_uploads_enabled,case_processing_enabled,case_evidence_days,intake_policy_approved_at,backup_retention_days,scanner_attested_at from public.recruitment_settings;\n\n-- Result 3: must be a validated CHECK prohibiting all five intake flags.\nselect conname,convalidated,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.recruitment_settings'::regclass and conname='recruitment_m31_intake_interlock';\n\n-- Result 4: both new buckets private, four existing buckets still present.\nselect id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id;\n\n-- Result 5: recruitment restrictive policy; compare all legacy policies with preflight.\nselect policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' order by policyname;\n\n-- Result 6: zero rows required.\nselect c.relname,r.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r where n.nspname='public' and c.relname~'^recruitment_' and c.relkind in('r','p') and r.rolname in('anon','authenticated','service_role') and (has_table_privilege(r.rolname,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and has_column_privilege(r.rolname,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')));\n\n-- Result 7: actual function EXECUTE permissions; service_allowed must equal expected_service.\nwith expected(signature) as(values ${values([...service].sort())})\nselect p.oid::regprocedure::text signature,p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_allowed,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_allowed,has_function_privilege('service_role',p.oid,'EXECUTE') service_allowed,exists(select 1 from expected e where to_regprocedure(e.signature)::oid=p.oid) expected_service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname~'^recruitment_' and p.prokind='f' order by signature;\n\n-- Result 8: retired signatures must all be absent.\nselect signature,to_regprocedure(signature) installed from(values ${values([...obsolete].sort())}) x(signature);\n\n-- Result 9: new triggers only; compare other triggers with preflight.\nselect n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and t.tgname~'^recruitment_' order by n.nspname,c.relname,t.tgname;\n\n-- Result 10: protected installation evidence, no credentials or applicant rows.\nselect id,action,database_actor,operator_reference,approval_reference,created_at,details->>'sourceCommit' source_commit,details->>'sourceSetSha256' source_set_sha256 from public.recruitment_operational_events where action='installation_m1_m3' order by created_at desc;\n\n-- Result 11: sequence privileges; all access booleans must be false.\nselect r.rolname,has_sequence_privilege(r.oid,'public.recruitment_vacancy_reference_seq','USAGE,SELECT,UPDATE') any_direct_access from pg_roles r where r.rolname in('anon','authenticated','service_role');\n\n-- Result 12: identity backfill counts only; no tutor identity was changed.\nselect count(*) binding_records,count(*) filter(where history_unresolved) unresolved_history_records from public.recruitment_tutor_bindings;\n`;
emit(out+'/02-post-installation-read-only.sql',post);
const walk=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(dir+'/'+entry.name,prefix+entry.name+'/'):[prefix+entry.name]);
const artifacts=walk(out).filter(path=>path!=='manifest.json').sort();
const files=artifacts.map(path=>({path,sha256:sha(readFileSync(out+'/'+path)),bytes:readFileSync(out+'/'+path).length}));
const runtimeSources=['vercel.json','package.json','scripts/recruitment-clamav-gateway.mjs','scripts/recruitment-erasure-manifest.mjs','api/_lib/recruitment-deployment.ts','src/components/admin/recruitment/RecruitmentDeploymentWorkspace.tsx'].map(path=>{const bytes=readFileSync(path);return{path,sha256:sha(bytes),bytes:bytes.length};});
emit(out+'/manifest.json',JSON.stringify({status:'PREPARED_PRODUCTION_EXECUTION_REQUIRES_SEPARATE_APPROVAL',sourceCommit,sourceSetSha256,sourceMigrations:sourceManifest,runtimeSources,runtimeSourcesNote:'Hashes describe the packaged worktree; sourceCommit pins only the eleven immutable migration sources. Deploy the final reviewed work commit, including dashboard and wrappers.',expectedRecruitmentTables:42,expectedStorageBucketsBefore:4,expectedStorageBucketsAfter:6,supabaseMigrationHistoryCreated:false,productionSqlExecuted:false,localRehearsalEvidence:'REHEARSAL.md',files},null,2)+'\n');
console.log(JSON.stringify({prepared:true,check,productionSqlExecuted:false,sourceMigrations:sources.length,tables:tables.length,serviceRpcs:service.size,sourceSetSha256,installationSha256:sha(installation)},null,2));
