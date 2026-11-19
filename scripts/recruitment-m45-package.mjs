// Local artifact preparation only: no environment configuration, Git, database,
// network, production SQL execution or deployment calls.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const directory = 'docs/recruitment/milestone-4-5/production';
const names = [
  '20261115010000_recruitment_selection.sql',
  '20261115020000_recruitment_engagement.sql',
  '20261115025000_recruitment_onboarding_documents.sql',
  '20261115030000_recruitment_lifecycle_workers.sql',
  '20261115040000_recruitment_lifecycle_recovery.sql',
];
const check = process.argv.includes('--check');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const literal = (text) => "'" + text.replaceAll("'", "''") + "'";
const values = (items) => items.map((item) => '(' + literal(item) + ')').join(',\n');
const oldManifest = JSON.parse(readFileSync('docs/recruitment/production-installation/manifest.json', 'utf8'));
const oldSources = oldManifest.sourceMigrations.map((entry) => {
  const bytes = readFileSync(entry.path);
  if (sha(bytes) !== entry.sha256) throw Error('M1–M3 baseline migration drift: ' + entry.path);
  return bytes.toString('utf8');
});
const baselineTables = [...new Set(oldSources.flatMap((source) => [...source.matchAll(/create table if not exists public\.(recruitment_\w+)/gi)].map((m) => m[1])))].sort();
if (baselineTables.length !== 42) throw Error('Expected installed M1–M3 baseline of 42 recruitment tables');
const sources = names.map((name, index) => {
  const path = 'supabase/migrations/' + name, bytes = readFileSync(path);
  return { order: index + 1, path, bytes: bytes.length, sha256: sha(bytes), text: bytes.toString('utf8') };
});
const sourceMigrations = sources.map(({ text: _text, ...entry }) => entry);
const sourceSetSha256 = sha(JSON.stringify(sourceMigrations));
const newTables = [...new Set(sources.flatMap((s) => [...s.text.matchAll(/create table (?:if not exists )?public\.(recruitment_\w+)/gi)].map((m) => m[1])))].sort();
if (newTables.some((table) => baselineTables.includes(table))) throw Error('Incremental package attempts to recreate a baseline table');
// Pin the exact source body of each existing function replaced by this package.
// This prevents silently overwriting a target-specific security correction.
const baselineFunctions = new Map();
for (const source of oldSources)
  for (const m of source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(recruitment_\w+)\([\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$;/gi)) baselineFunctions.set(m[1], m[2]);
// These established accounting read functions are narrowly guarded by M5;
// pin their actual unchanged canonical baseline bodies as well.
for (const m of readFileSync('supabase/schema.sql','utf8').matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(accounting_snapshot|accounting_document_data|accounting_export_rows)\([\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$;/gi)) baselineFunctions.set(m[1],m[2]);
const replaced = new Set(['recruitment_guard_case','accounting_snapshot','accounting_document_data','accounting_export_rows']);
for (const source of sources)
  for (const m of source.text.matchAll(/create or replace function public\.(recruitment_\w+)\(/gi))
    if (baselineFunctions.has(m[1])) replaced.add(m[1]);
const guardedFunctions = [...replaced].sort().map((name) => {
  if (!baselineFunctions.has(name)) throw Error('Missing guarded baseline function: ' + name);
  return { name, sha256: sha(baselineFunctions.get(name)) };
});
// Replay the explicit migration ACL changes over the pinned M3 service allowlist.
// Internal helpers must not become service RPCs merely because their names match.
const expectedServiceRpcs = new Set(JSON.parse(readFileSync('docs/recruitment/production-installation/expected-service-rpcs.json', 'utf8')));
for (const source of sources) {
  for (const statement of source.text.matchAll(/(grant execute|revoke all) on function ([\s\S]*?) (?:to|from) ([^;]+);/gi)) {
    if (!/\bservice_role\b/i.test(statement[3])) continue;
    for (const signature of statement[2].matchAll(/public\.[a-z_]+\([^)]*\)/gi)) {
      const normalized = signature[0].replace(/\s+/g, ' ').replace(/, /g, ',');
      if (statement[1].toLowerCase() === 'grant execute') expectedServiceRpcs.add(normalized);
      else expectedServiceRpcs.delete(normalized);
    }
  }
}
const serviceRpcs = [...expectedServiceRpcs].sort();
const signatureGuards = guardedFunctions.map((entry) => `
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=${literal(entry.name)})<>1
 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=${literal(entry.name)} and prosecdef and coalesce(proconfig,'{}') @> array['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')=${literal(entry.sha256)})
 then raise exception 'Unsupported baseline function: ${entry.name}; review target drift before installation';end if;`).join('\n');
const header = `-- INCREMENTAL M4/M5 EXECUTION-REVIEW PACKAGE. DO NOT EXECUTE WITHOUT EXACT-SCRIPT APPROVAL.
-- Existing populated M1–M3 ONLY. Never rerun the fresh installer or platform schema.
-- Replace the three non-secret references after reviewing the exact target and backups.
begin;
set local lock_timeout='5s';
set local statement_timeout='180s';
set local viva_m45.operator='__REQUIRED_OPERATOR_REFERENCE__';
set local viva_m45.approval='__REQUIRED_M45_APPROVAL_REFERENCE__';
set local viva_m45.project='__REQUIRED_PROJECT_REFERENCE__';
lock table public.recruitment_settings in share row exclusive mode;
do $m45_preflight$
declare n text;begin
 if current_setting('viva_m45.operator') like '%__REQUIRED_%' or current_setting('viva_m45.approval') like '%__REQUIRED_%' or current_setting('viva_m45.project') like '%__REQUIRED_%'
 then raise exception 'Explicit target, operator and exact-script approval references are required';end if;
 if not exists(select 1 from public.recruitment_operational_events where action='installation_m1_m3' and details->>'sourceSetSha256'=${literal(oldManifest.sourceSetSha256)})
 then raise exception 'Unsupported baseline: verified M1–M3 installation evidence required';end if;
 if exists(select 1 from public.recruitment_operational_events where action='installation_m4_m5')
 then raise exception 'M4/M5 already installed; use reviewed forward recovery';end if;
 for n in select name from(values ${values(baselineTables)}) expected(name) loop
  if not exists(select 1 from pg_class where oid=to_regclass('public.'||n) and relkind='r' and relrowsecurity) then raise exception 'Unsupported baseline table/RLS: %',n;end if;
 end loop;
 for n in select name from(values ${values(newTables)}) expected(name) loop
  if to_regclass('public.'||n) is not null then raise exception 'M4/M5 object already exists: %; do not partially reinstall',n;end if;
 end loop;
 if (select count(*) from public.recruitment_settings)<>1 then raise exception 'Unsupported recruitment settings cardinality';end if;
${signatureGuards}
end $m45_preflight$;
create temporary table viva_m45_settings_before on commit drop as select to_jsonb(s) value from public.recruitment_settings s;
create temporary table viva_m45_buckets_before on commit drop as select id,to_jsonb(b) value from storage.buckets b;
`;
const body = sources.map((source) => `\n-- BEGIN EXACT SOURCE: ${source.path}\n-- SHA256 ${source.sha256}\n${source.text}\n-- END EXACT SOURCE: ${source.path}\n`).join('');
const checks = `
-- Integrity checks are in the same transaction: any failure rolls back all DDL.
do $m45_postflight$
declare n text;r record;begin
 if exists(select 1 from public.recruitment_settings s where (to_jsonb(s)-array['selection_enabled','onboarding_enabled','activation_enabled']) is distinct from (select value from viva_m45_settings_before))
 then raise exception 'Existing recruitment settings changed unexpectedly';end if;
 if exists(select 1 from public.recruitment_settings where selection_enabled or onboarding_enabled or activation_enabled)
 then raise exception 'New M4/M5 features must remain disabled';end if;
 if exists(select 1 from viva_m45_buckets_before old full join storage.buckets b using(id) where old.value is distinct from to_jsonb(b))
 then raise exception 'Storage buckets changed unexpectedly';end if;
 for n in select name from(values ${values(newTables)}) expected(name) loop
  if not exists(select 1 from pg_class where oid=to_regclass('public.'||n) and relkind='r' and relrowsecurity) then raise exception 'Missing new RLS table: %',n;end if;
  for r in select rolname from pg_roles where rolname in ('anon','authenticated','service_role') loop
   if has_table_privilege(r.rolname,'public.'||n,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.'||n) and a.attnum>0 and not a.attisdropped and has_column_privilege(r.rolname,a.attrelid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) then raise exception 'Unexpected direct table/column access: %.%',r.rolname,n;end if;
  end loop;
 end loop;
 for r in select p.oid,p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'recruitment_%' loop
  if has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('authenticated',r.oid,'EXECUTE') then raise exception 'Unexpected browser RPC privilege: %',r.proname;end if;
  if has_function_privilege('service_role',r.oid,'EXECUTE') and not exists(select 1 from(values ${values(serviceRpcs)}) expected(signature) where to_regprocedure(expected.signature)::oid=r.oid) then raise exception 'Unexpected service RPC privilege: %',r.proname;end if;
  if exists(select 1 from pg_proc p where p.oid=r.oid and p.prosecdef and not coalesce(p.proconfig,'{}') @> array['search_path=""']) then raise exception 'Unsafe security definer search_path: %',r.proname;end if;
 end loop;
 for n in select signature from(values ${values(serviceRpcs)}) expected(signature) loop
  if to_regprocedure(n) is null or not has_function_privilege('service_role',to_regprocedure(n),'EXECUTE') then raise exception 'Missing intended service RPC: %',n;end if;
 end loop;
 insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,details)
 values('installation_m4_m5',session_user,current_setting('viva_m45.operator'),current_setting('viva_m45.approval'),
 'Approved incremental M4/M5 installation; existing controls preserved and new features disabled',
 jsonb_build_object('sourceSetSha256',${literal(sourceSetSha256)},'projectReference',current_setting('viva_m45.project'),'sourceMigrations',${literal(JSON.stringify(sourceMigrations))}::jsonb));
end $m45_postflight$;
notify pgrst,'reload schema';
commit;
`;
const sql = header + body + checks;
mkdirSync(directory, { recursive: true });
function emit(path, text) {
  if (check) {
    if (readFileSync(path, 'utf8') !== text) throw Error('Stale generated M4/M5 artifact: ' + path);
  } else writeFileSync(path, text);
}
emit(directory + '/migration.sql', sql);
const artifacts = ['README.md', 'preflight.sql', 'verify.sql', 'migration.sql'].map((path) => {
  const bytes = path === 'migration.sql' ? Buffer.from(sql) : readFileSync(directory + '/' + path);
  return { path, bytes: bytes.length, sha256: sha(bytes) };
});
emit(directory + '/manifest.json', JSON.stringify({
  status: 'PREPARED_INCREMENTAL_EXECUTION_REQUIRES_SEPARATE_APPROVAL',
  baselineSourceSetSha256: oldManifest.sourceSetSha256, sourceSetSha256,
  localSchemaBaseline: 'supabase/schema.sql (M1–M3); apply sourceMigrations in order for M4/M5',
  installationMode: 'incremental-on-populated-M1-M3-only',
  executionApprovalRequired: true,
  sourceMigrations, guardedFunctions, newTables, expectedServiceRpcs: serviceRpcs,
  newFlags: ['selection_enabled', 'onboarding_enabled', 'activation_enabled'],
  productionSqlExecuted: false, liveFeatureFlagsChanged: false,
  environmentVariablesChanged: false, supabaseMigrationHistoryCreated: false,
  files: artifacts,
}, null, 2) + '\n');
console.log(`M4/M5 incremental package ${check ? 'verified' : 'prepared'}: ${sources.length} migrations; ${newTables.length} new RLS tables; ${guardedFunctions.length} guarded baseline functions.`);
