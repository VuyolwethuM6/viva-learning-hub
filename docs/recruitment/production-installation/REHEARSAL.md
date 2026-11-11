# Native PostgreSQL installation rehearsal

Executed locally on 11 November 2026, without a production connection. Docker image `postgres:17-bookworm`, image digest `sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994`, reported **PostgreSQL 17.11 (Debian 17.11-1.pgdg12+2)**. Container network is `none`, data is disposable tmpfs, no host database port is published and no database URL or external credential is accepted by the runner.

The executing installer role was `postgres`, **not a superuser**, with BYPASSRLS matching the reviewed target. An independent fixture bootstrap superuser created the container roles. The fixture reproduces the committed pre-recruitment legacy schema, independently owned Auth table/schema with the existing installer privileges, RLS-enabled Storage, four existing buckets and broad public default API ACLs. Storage policy creation uses the standard ownership branch: it does not reproduce the hosted Supautils extension. Supabase Auth API, Storage HTTP, actual Vercel and provider behavior remain hosted acceptance gates.

## What passed

- Exact `01-install-m1-through-m3.sql`, including its wrapper, all **11 byte-identical committed source migrations**, in-transaction postconditions and protected installation marker.
- All **42 recruitment tables**, RLS, direct table/column/sequence/MAINTAIN privilege denial, exactly **50 intended service RPC signatures**, absent retired overloads, two private recruitment buckets and restrictive Storage policy.
- All 12 blocks of `02-post-installation-read-only.sql` executed.
- **75 legacy public tables** compared before/after by deterministic JSON row snapshots, including synthetic populated enrollment/admin/tutor/history data and existing seeded accounting settings. Existing indexes, non-recruitment triggers, Auth fixture identities and all four legacy bucket definitions remained identical. The same legacy row comparison passed after the synthetic activation/pause exercises.
- Missing real approval placeholders abort before recruitment DDL. A repeated installation aborts on the occupied namespace. Each of the five individual intake flags is rejected by the installed all-off interlock.
- Native multi-connection tests: two concurrent retries of the same request returned identical results with exactly one request journal and audit event; two different saves at the same revision produced one success and one revision rejection, with exactly one increment. These exercise independent PostgreSQL connections rather than PGlite serialization.
- Templates 03–06 reject missing parameters, policy approval, owners, settings revision or release prerequisites. Positive bootstrap, second independent owner, privacy/form governance, attestations, vacancy publication/release, talent-pool release and 07 pause passed using **synthetic evidence only**.
- The release CHECK rejects owner-MFA suspension or scanner-attestation removal while intake remains active. Default pause retains existing applicant email; complete pause stops all five flags and permits the separately authorized recovery operation.

No old migration body required correction. An explicit Auth/Storage schema-USAGE precheck was added to the installer wrapper. Native fixture setup errors (bootstrap-role ownership/schema privileges) were corrected in the rehearsal runner; they were not production migration failures or changes to production grants.

## Reproduce safely

Run from the repository root using the managed local Docker daemon. Never point this runner at a hosted database. It hardcodes the labelled container/socket and rejects a different image, label or network mode. Clear inherited Docker endpoint selectors, preserving existing registry/proxy configuration:

```bash
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock run --detach --name viva-recruitment-install-rehearsal --label viva.recruitment.disposable=true --network none --tmpfs /var/lib/postgresql/data:rw --env POSTGRES_USER=viva_fixture_admin --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-bookworm
node scripts/recruitment-production-package.mjs --check
node scripts/recruitment-installation-rehearsal.mjs
```

Wait for the container's `pg_isready -U viva_fixture_admin -d postgres` before running. The trust setting is acceptable **only for this network-isolated disposable container** and is not a production configuration. Each invocation creates a new fixture database. Remove only this labelled rehearsal container when finished. The runner writes sanitized synthetic logs, JSON evidence and verification output under `/workspace/artifacts/recruitment-deployment/`; it does not write production approval evidence or change checked-in migrations. Evidence from an earlier wrapper hash is obsolete after regeneration; rerun before release.

## Checksums for the rehearsed SQL

- Installation: `b2650d8a1cd526a50b5f0b588d4b78bf85cb7466cb4a898865afc488334f90f4`.
- Read-only verification: `28332bc25bdd71b5b433a6352cf3c9db5b91c70e29d6f2c81a50e1af9eda9e69`.
- Eleven-source set: `6262989e8a7ce90ce6431e15b0c9f2923dbde84be48079dfc05b50517f6553e3`.

These identify the unbound review scripts. After real operator/approval/project/UUID/revision values are substituted privately, calculate and approve the instantiated artifact checksum separately. A successful synthetic release is not evidence that real malware scanning, mail delivery, legal policy, backups or owner MFA are accepted.
