// Disposable Docker PostgreSQL ONLY. No database URL, host or credentials accepted.
// Start the labelled --network none postgres:17-bookworm container documented in REHEARSAL.md.
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const container = "viva-recruitment-install-rehearsal";
const dockerArgs = ["--host=unix:///var/run/docker.sock"];
const env = { ...process.env };
for (const name of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[name];
const info = JSON.parse(
  execFileSync("docker", [...dockerArgs, "inspect", container], {
    env,
    encoding: "utf8",
  }),
)[0];
assert.equal(info.Config.Labels["viva.recruitment.disposable"], "true");
assert.equal(info.HostConfig.NetworkMode, "none");
assert.equal(info.Config.Image, "postgres:17-bookworm");
const directory = "docs/recruitment/production-installation";
const database = "viva_rehearsal_" + Date.now();
const logs = [];
function sql(text, { db = database, role = "postgres", fail = false } = {}) {
  const result = spawnSync(
    "docker",
    [
      ...dockerArgs,
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      role,
      "-d",
      db,
      "-At",
    ],
    { env, input: text, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  logs.push({
    ok: result.status === 0,
    stderr: result.stderr,
    stdout: result.stdout,
  });
  if (fail)
    assert.notEqual(result.status, 0, "Expected fail-closed SQL rejection");
  else if (result.status !== 0)
    throw Error(
      result.stderr || result.error?.message || "Disposable SQL failed",
    );
  return result.stdout.trim();
}
const bind = (text) =>
  text.replace(/__REQUIRED_[A-Z_]+__/g, "SYNTHETIC-REHEARSAL-NOT-PRODUCTION");
const hash = (text) => createHash("sha256").update(text).digest("hex");
function concurrentSql(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        ...dockerArgs,
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        database,
        "-At",
      ],
      { env },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (bytes) => {
      stdout += bytes;
    });
    child.stderr.on("data", (bytes) => {
      stderr += bytes;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      logs.push({ ok: status === 0, stderr, stdout });
      resolve({ status, stdout: stdout.trim(), stderr });
    });
    child.stdin.end(text);
  });
}
try {
  sql(
    `do $$begin if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres login bypassrls;end if;end$$;`,
    { db: "postgres", role: "viva_fixture_admin" },
  );
  sql(`create database ${database} owner postgres;`, {
    db: "postgres",
    role: "viva_fixture_admin",
  });
  sql(
    `do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;
    if not exists(select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin;end if;
  end$$;`,
    { role: "viva_fixture_admin" },
  );
  sql(`
  create schema auth authorization postgres;
  create table auth.users(id uuid primary key,email varchar(255),email_confirmed_at timestamptz);
  alter table auth.users enable row level security;
  create schema storage authorization postgres;
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
  alter table storage.objects enable row level security;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  alter table storage.buckets enable row level security;
  `);
  // Full committed legacy schema is used ONLY to seed a disposable compatibility fixture.
  const base = readFileSync("supabase/schema.sql", "utf8").split(
    "-- BEGIN RECRUITMENT MILESTONE 1",
  )[0];
  sql(base);
  // Keep public objects owned by the non-superuser used by the actual installer.
  sql(
    `
    insert into auth.users values('11111111-1111-4111-8111-111111111111','synthetic-legacy@example.test',now());
    insert into public.admin_users(user_id,enabled,finance_role) values('11111111-1111-4111-8111-111111111111',true,'owner');
    set viva.teaching_actor='11111111-1111-4111-8111-111111111111';
    insert into public.teaching_tutors(id,name,email,user_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic tutor','synthetic-legacy@example.test','11111111-1111-4111-8111-111111111111');
    insert into public.applications(application_number,learner_name,learner_email,guardian_name,guardian_email,grade_level,tutoring_mode) values('SYNTHETIC-LEGACY','Synthetic learner','learner@example.test','Synthetic guardian','guardian@example.test','12','Online');
    alter table auth.users owner to supabase_auth_admin;
    alter schema auth owner to supabase_auth_admin;
    grant usage on schema auth to postgres;
    grant all on auth.users to postgres;
    alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
  `,
    { role: "viva_fixture_admin" },
  );
  const version = sql("show server_version;");
  assert.match(version, /^17\./);
  const legacy = JSON.parse(
    sql(
      "select json_agg(tablename order by tablename) from pg_tables where schemaname='public'",
    ),
  );
  const snapshot = () =>
    legacy.map((table) => [
      table,
      sql(
        `select coalesce(jsonb_agg(x order by x::text),'[]') from(select to_jsonb(t) x from public.${table} t)s;`,
      ),
    ]);
  const before = snapshot();
  const buckets = sql(
    "select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b;",
  );
  assert.equal(JSON.parse(buckets).length, 4);
  const identities = sql(
    "select jsonb_agg(to_jsonb(u) order by id) from auth.users u;",
  );
  const legacyTriggers = sql(
    "select jsonb_agg(pg_get_triggerdef(oid) order by tgname,tgrelid) from pg_trigger where not tgisinternal;",
  );
  const indexes = sql(
    "select jsonb_agg(indexdef order by schemaname,indexname) from pg_indexes where schemaname in('public','auth','storage');",
  );
  const installation = readFileSync(
    directory + "/01-install-m1-through-m3.sql",
    "utf8",
  );
  const manifest = JSON.parse(
    readFileSync(directory + "/manifest.json", "utf8"),
  );
  for (const migration of manifest.sourceMigrations) {
    const bytes = readFileSync(migration.path);
    assert.equal(hash(bytes), migration.sha256);
    assert.ok(
      installation.includes(bytes.toString()),
      "Installer must contain exact committed source bytes",
    );
  }
  sql(installation, { fail: true }); // Unbound approval references must stop before DDL.
  assert.equal(
    sql("select count(*) from pg_tables where tablename like 'recruitment_%'"),
    "0",
  );
  sql(bind(installation)); // Exact wrapper, all 11 sources, postconditions and transaction.
  assert.deepEqual(
    snapshot(),
    before,
    "Every populated legacy public table must remain byte-equivalent",
  );
  assert.equal(
    sql(
      "select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b where id not like 'recruitment-%';",
    ),
    buckets,
  );
  assert.equal(
    sql("select jsonb_agg(to_jsonb(u) order by id) from auth.users u;"),
    identities,
  );
  assert.equal(
    sql(
      "select jsonb_agg(pg_get_triggerdef(oid) order by tgname,tgrelid) from pg_trigger where not tgisinternal and tgname not like 'recruitment_%';",
    ),
    legacyTriggers,
  );
  assert.equal(
    sql(
      "select jsonb_agg(indexdef order by schemaname,indexname) from pg_indexes where schemaname in('public','auth','storage') and tablename not like 'recruitment_%';",
    ),
    indexes,
  );
  const verification = sql(
    readFileSync(directory + "/02-post-installation-read-only.sql", "utf8"),
  );
  sql(bind(installation), { fail: true }); // Reinstallation cannot overwrite data.
  for (const flag of [
    "vacancy_intake_enabled",
    "talent_pool_intake_enabled",
    "applicant_email_enabled",
    "document_uploads_enabled",
    "case_processing_enabled",
  ])
    sql(`update public.recruitment_settings set ${flag}=true;`, { fail: true });
  sql(readFileSync(directory + "/03-owner-and-console.sql.template", "utf8"), {
    fail: true,
  });
  sql(
    bind(
      readFileSync(
        directory + "/04-operational-attestations.sql.template",
        "utf8",
      ),
    ),
    { fail: true },
  );
  sql(
    bind(
      readFileSync(
        directory + "/05-vacancy-pilot-activation.sql.template",
        "utf8",
      ),
    ),
    { fail: true },
  );
  sql(
    bind(
      readFileSync(
        directory + "/06-talent-pool-activation.sql.template",
        "utf8",
      ),
    ),
    { fail: true },
  );
  sql(
    bind(readFileSync(directory + "/07-emergency-pause.sql.template", "utf8")),
  );
  assert.equal(
    sql(
      "select count(*) from public.recruitment_operational_events where action='installation_m1_m3';",
    ),
    "1",
  );
  // Positive operational SQL is exercised with entirely synthetic approvals in
  // the disposable database. This does not certify any real service or policy.
  const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const owner = "11111111-1111-4111-8111-111111111111";
  function change(operation, fields) {
    const payload = quote(
      JSON.stringify({ requestId: randomUUID(), ...fields }),
    );
    const proof = quote(randomBytes(32).toString("hex"));
    return JSON.parse(
      sql(
        `select public.recruitment_issue_challenge('${owner}','${"a".repeat(64)}',${quote(operation)},${payload},${proof},'aal2');select public.recruitment_mutate('${owner}',${quote(operation)},${payload},'${"a".repeat(64)}',${proof},'aal2');`,
      ),
    );
  }
  sql(
    bind(
      readFileSync(directory + "/03-owner-and-console.sql.template", "utf8"),
    ).replace("owner_id uuid=null", `owner_id uuid='${owner}'`),
  );
  sql(
    "insert into auth.users values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','second-owner@example.test',now());",
  );
  change("staff_grant", {
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    role: "owner",
    enabled: true,
    expectedRevision: -1,
  });
  change("settings", {
    expectedRevision: Number(
      sql("select revision from public.recruitment_settings"),
    ),
    staffConsoleEnabled: true,
    accessGuardsEnabled: true,
    privacyPolicyVersion: "synthetic-v1",
  });
  change("intake_policy", {
    noticeVersion: "synthetic-v1",
    noticeText:
      "Synthetic legal notice for isolated SQL rehearsal only. ".repeat(5),
    approvalReference: "SYNTHETIC-LEGAL-NOT-PRODUCTION",
    evidenceDays: 7,
  });
  sql(
    bind(
      readFileSync(
        directory + "/04-operational-attestations.sql.template",
        "utf8",
      ),
    ).replace("backup_days integer=null", "backup_days integer=30"),
  );
  const { emptyVacancyContent } = await import(
    "../src/lib/recruitment-vacancies.ts"
  );
  const created = change("vacancy_create", {
    scopeId: null,
    content: {
      ...emptyVacancyContent(),
      title: "Synthetic rehearsal vacancy",
      department: "Teaching",
      location: "Cape Town",
      summary: "Synthetic vacancy for disposable SQL rehearsal only.",
      responsibilities: ["Support learning"],
      minimumRequirements: ["Relevant experience"],
      requiredExperience: "Relevant experience",
      scheduleDetails: "Afternoons",
      subjects: ["Mathematics"],
      grades: ["12"],
      opensAt: new Date(Date.now() - 86400000).toISOString(),
      closesAt: new Date(Date.now() + 86400000).toISOString(),
      requiredDocuments: [{ key: "cv", label: "CV", required: true }],
    },
  });
  const content = JSON.parse(
    sql(
      `select x.content from public.recruitment_vacancies v join public.recruitment_vacancy_versions x on x.id=v.draft_version_id where v.id=${quote(created.vacancyId)}`,
    ),
  );
  function prepareSave(requestId, revision) {
    const payload = quote(
      JSON.stringify({
        requestId,
        vacancyId: created.vacancyId,
        expectedRevision: revision,
        content,
      }),
    );
    const proof = quote(randomBytes(32).toString("hex"));
    sql(
      `select public.recruitment_issue_challenge('${owner}','${"a".repeat(64)}','vacancy_save',${payload},${proof},'aal2');`,
    );
    return `select public.recruitment_mutate('${owner}','vacancy_save',${payload},'${"a".repeat(64)}',${proof},'aal2');`;
  }
  const repeatedId = randomUUID();
  const repeatedSave = prepareSave(repeatedId, 0);
  const duplicates = await Promise.all([
    concurrentSql(repeatedSave),
    concurrentSql(repeatedSave),
  ]);
  assert.deepEqual(
    duplicates.map((result) => result.status),
    [0, 0],
  );
  assert.equal(duplicates[0].stdout, duplicates[1].stdout);
  assert.equal(
    sql(
      `select count(*) from public.recruitment_requests where id='${repeatedId}'`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `select count(*) from public.recruitment_events where request_id='${repeatedId}'`,
    ),
    "1",
  );
  const conflictingSaves = [
    prepareSave(randomUUID(), 1),
    prepareSave(randomUUID(), 1),
  ];
  const races = await Promise.all(conflictingSaves.map(concurrentSql));
  assert.equal(races.filter((result) => result.status === 0).length, 1);
  assert.match(
    races.find((result) => result.status !== 0).stderr,
    /changed|revision/i,
  );
  assert.equal(
    sql(
      `select revision from public.recruitment_vacancies where id=${quote(created.vacancyId)}`,
    ),
    "2",
  );
  for (const operation of [
    "vacancy_submit",
    "vacancy_approve",
    "vacancy_publish",
  ])
    change(operation, {
      vacancyId: created.vacancyId,
      expectedRevision: Number(
        sql(
          `select revision from public.recruitment_vacancies where id=${quote(created.vacancyId)}`,
        ),
      ),
      reason: "",
    });
  const versionId = sql(
    `select published_version_id from public.recruitment_vacancies where id=${quote(created.vacancyId)}`,
  );
  const form = change("intake_form_approve", {
    purpose: "vacancy",
    vacancyId: created.vacancyId,
    versionId,
    noticeVersion: "synthetic-v1",
  });
  change("intake_form_bind", {
    formId: form.formId,
    expectedRevision: -1,
    enabled: true,
  });
  const pool = change("intake_form_approve", {
    purpose: "talent_pool",
    vacancyId: null,
    versionId: null,
    noticeVersion: "synthetic-v1",
  });
  change("intake_form_bind", {
    formId: pool.formId,
    expectedRevision: -1,
    enabled: true,
  });
  for (const operation of ["lock_safeguards", "require_owner_mfa"])
    sql(
      `select public.recruitment_operate('${operation}','SYNTHETIC-OPERATOR','SYNTHETIC-APPROVAL','Disposable acceptance only, no actual owner enrollment or services');`,
    );
  const release = bind(
    readFileSync(
      directory + "/05-vacancy-pilot-activation.sql.template",
      "utf8",
    ),
  )
    .replace(
      "pilot_vacancy uuid=null",
      `pilot_vacancy uuid='${created.vacancyId}'`,
    )
    .replace(
      "expected_revision integer=null",
      `expected_revision integer=${Number(sql("select revision from public.recruitment_settings"))}`,
    );
  sql(release);
  assert.equal(
    sql(
      "select vacancy_intake_enabled and applicant_email_enabled and document_uploads_enabled and case_processing_enabled and not talent_pool_intake_enabled from public.recruitment_settings",
    ),
    "t",
  );
  sql(
    "select public.recruitment_operate('exception_suspend_owner_mfa','SYNTHETIC-OPERATOR','SYNTHETIC-APPROVAL','Must fail while release is active');",
    { fail: true },
  );
  sql("update public.recruitment_settings set scanner_attested_at=null;", {
    fail: true,
  });
  sql(
    bind(
      readFileSync(
        directory + "/06-talent-pool-activation.sql.template",
        "utf8",
      ),
    ).replace(
      "expected_revision integer=null",
      `expected_revision integer=${Number(sql("select revision from public.recruitment_settings"))}`,
    ),
  );
  assert.equal(
    sql("select talent_pool_intake_enabled from public.recruitment_settings"),
    "t",
  );
  sql(
    bind(readFileSync(directory + "/07-emergency-pause.sql.template", "utf8")),
  );
  assert.equal(
    sql(
      "select applicant_email_enabled and not vacancy_intake_enabled and not talent_pool_intake_enabled and not document_uploads_enabled and not case_processing_enabled from public.recruitment_settings",
    ),
    "t",
  );
  sql(
    bind(
      readFileSync(directory + "/07-emergency-pause.sql.template", "utf8"),
    ).replace(
      "keep_existing_applicant_email boolean=true",
      "keep_existing_applicant_email boolean=false",
    ),
  );
  sql(
    "select public.recruitment_operate('exception_suspend_owner_mfa','SYNTHETIC-OPERATOR','SYNTHETIC-APPROVAL','Allowed only after all five flags paused in disposable test');",
  );
  assert.deepEqual(
    snapshot(),
    before,
    "Legacy data must also survive governance/release/pause rehearsal",
  );
  const report = {
    environment:
      "Disposable network-isolated native Docker PostgreSQL; no production connection",
    serverVersion: version,
    installerSuperuser: sql(
      "select rolsuper from pg_roles where rolname=current_user",
    ),
    storagePolicyAuthority:
      "Standard ownership branch; Supabase Supautils delegation remains a hosted acceptance requirement",
    sourceMigrations: manifest.sourceMigrations.length,
    recruitmentTables: Number(
      sql(
        "select count(*) from pg_tables where schemaname='public' and tablename like 'recruitment_%'",
      ),
    ),
    preservedLegacyTables: legacy.length,
    preservedLegacyData: true,
    preservedLegacyTriggersAndIndexes: true,
    installationSha256: hash(installation),
    sourceSetSha256: manifest.sourceSetSha256,
    placeholderRejected: true,
    repeatedInstallRejected: true,
    allFiveFlagsRejected: true,
    releasePrerequisitesFailClosed: true,
    syntheticBootstrapAndAttestationsPassed: true,
    syntheticVacancyAndTalentPoolReleasePassed: true,
    releaseInterlockBlocksMfaOrScannerDisablement: true,
    nativeMultiConnectionIdempotencyAndRevisionRaces: true,
    emergencyPausePassed: true,
    fullPauseAllowsApprovedRecovery: true,
    postInstallationVerification:
      "All 12 SELECT blocks executed; installer privilege and invariant assertions passed",
    limitations: [
      "Auth API, Storage HTTP, Supautils policy delegation, external email/scanner and Vercel runtime are not simulated as hosted acceptance",
      "All positive operational approval evidence in this rehearsal is synthetic; actual production services, policies and owner recovery still require acceptance",
    ],
  };
  mkdirSync("/workspace/artifacts/recruitment-deployment", { recursive: true });
  writeFileSync(
    "/workspace/artifacts/recruitment-deployment/installation-rehearsal.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  writeFileSync(
    "/workspace/artifacts/recruitment-deployment/installation-verification.txt",
    verification + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  mkdirSync("/workspace/artifacts/recruitment-deployment", { recursive: true });
  writeFileSync(
    "/workspace/artifacts/recruitment-deployment/installation-rehearsal.log",
    logs
      .map(
        (entry, i) =>
          `STEP ${i + 1} ${entry.ok ? "OK" : "REJECTED"}\n${entry.stderr}\n${entry.stdout}`,
      )
      .join("\n"),
  );
}
