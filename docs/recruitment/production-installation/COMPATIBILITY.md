# Production compatibility findings from supplied inventory

Source: user-supplied `remaining_compatibility_evidence` CSV, received 11 November 2026. No production connection/SQL executed by this agent. This report stores conclusions only, not Auth accounts, applicant data or credentials.

- PostgreSQL 17.11 / SQL Editor `postgres`, pgcrypto present (prior user inventory).
- All 22 required columns compatible. Auth email is varchar(255), explicitly accepted as text-like. UUID FKs, timestamps, teaching_events JSONB and Storage cap/MIME types match committed dependencies.
- `admin_users.finance_role` CHECK permits owner/bookkeeper/viewer, matching rank semantics in the M1 safeguard. Public admin/tutor/event tables are ordinary postgres-owned RLS tables. Existing PKs/uniques were confirmed in the earlier follow-up; no index replacement is needed.
- Existing teaching_immutable/teaching_track and Supabase Auth indexes retain their names/definitions. Canonical source creates differently named recruitment triggers and backfills only a new continuity table. No existing tutor row is updated by the installation.
- Supabase service_role bypasses RLS; anon/authenticated do not. This is normal platform structure. The installer denies direct recruitment table/column/sequence access and browser RPC execution, with exactly 50 intended service RPC signatures after M1's dynamic grant loop and later corrections.
- Broad public-schema default privileges grant anon/authenticated/service_role access to new tables, sequences and functions. The canonical migrations revoke these permissions explicitly; postconditions must verify the effective result. Do not remove global defaults or alter legacy grants to install recruitment.
- Auth users is owned by supabase_auth_admin. Supplied postgres ACL includes TRIGGER and REFERENCES; inheritance of the owner role is NOT required for creating a new trigger. The previous draft owner-only Auth precheck was unnecessarily strict and has been corrected in the wrapper only. Auth accounts/indexes/RLS are not rewritten.
- Both Storage objects and buckets are owned by supabase_storage_admin; postgres does not inherit that owner and is not a superuser. INSERT on buckets is granted and RLS is already enabled. This supports inserting the two new private bucket records but does NOT, in standard PostgreSQL, authorize CREATE POLICY on storage.objects. BYPASSRLS and TRIGGER grants do not confer policy ownership.

## Storage policy authority confirmed

The user's final read-only result confirms SQL role `postgres`, `delegation_setting_registered=true` for `supautils.policy_grants`, and an explicit `storage.objects` entry in the executing role's delegated table list (also `storage.buckets`). This is the supported narrow policy-management authority required by the canonical M3 Storage policy. No ownership change, extra role membership, permanent grant, RLS disablement or server-setting change is needed. The installer checks this existing registered delegation again immediately before applying source SQL.

Official explanation: https://github.com/supabase/supautils#table-ownership-bypass (Manage Policies; CREATE/ALTER/DROP/COMMENT ON POLICY). Preparation consulted this public documentation and supplied catalog exports only; no permission-probing DDL or SQL was executed by the agent.

## Compatibility conclusion

Reported schema, index/trigger, namespace, RLS/default-ACL and Storage delegation evidence is compatible with the complete pinned M1–M3 source chain. No remaining inventory request is needed for the installation design. Actual execution is still separately authorized and guarded against target drift. The package is READY FOR EXECUTION REVIEW, not executed, not hosted-accepted and not approval to deploy or activate intake.

The subsequent authorized rehearsal executed the complete wrapper/source chain and release/pause templates in disposable native PostgreSQL 17.11. The installer ran as non-superuser `postgres`, with broad API default ACLs and an independently owned Auth table. Storage used standard ownership authority in the fixture; actual Supabase Supautils delegation remains a hosted check. A schema-USAGE precheck was added to fail before DDL on missing managed-schema access. No canonical migration bodies were changed. Operational provider, privacy, backup and owner-authentication acceptance remain gates before public release. See `REHEARSAL.md` for exact evidence and limitations.
