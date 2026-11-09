# Recruitment owner operations and recovery

These are protected database-operator procedures, not HTTP features. Rehearse against an isolated hosted project with synthetic accounts before any production approval. No operation in this runbook was executed against production during implementation. Do not use the full schema as an upgrade script.

## Authorization and evidence

1. Confirm the project reference and database host against the approved change ticket. Use a separately authenticated operator session; never use browser credentials or the application's service key. Production requires separate explicit approval.
2. A business owner or independently authorized organizational authority approves the exact action, target Auth UUID, environment, reason, operator and validation plan. For all-owner loss, use the established organizational identity-verification process; inability to sign in is not authorization. Require two-person approval. The operator must not approve their own elevation.
3. Verify identity through an independent, established channel. Verify control of the intended Auth identity, confirmed email and a usable password without collecting or logging credentials. Record verification evidence in the protected change ticket, not SQL, application logs or the repository. Verify no conflicting application/onboarding interest before restoring a business authority.
4. Record the actual operator's protected staff/change-system identifier and a unique approval/ticket reference. The database also captures `session_user`. A pooled database login alone is not sufficient individual attribution. Preserve database access logs and ticket approval timestamps.
5. All placeholders below must be replaced with reviewed values. Never put credentials, MFA seeds, recovery codes, candidate details or database passwords in these references. Execute one procedure inside one transaction. Keep the returned operational event UUID with the ticket. Do not disable triggers, reset bootstrap, edit permission tables directly or grant function execution to application roles.

## Initial setup and two independent test owners

Create two independently controlled verified password identities in the isolated Supabase Auth project using the approved test provisioning process. Use synthetic emails. Neither must gain general Admin, teaching or finance membership as a side effect.

```sql
begin;
select public.recruitment_bootstrap(
 'OWNER_A_AUTH_UUID'::uuid,
 'OPERATOR_REFERENCE', 'INDEPENDENT_APPROVAL_REFERENCE',
 'Approved initial recruitment owner setup in isolated project'
);
select id,action,database_actor,operator_reference,approval_reference,created_at
from public.recruitment_operational_events order by created_at desc limit 1;
commit;
```

Owner A signs in at `/admin/recruitment` and adds Owner B using the normal reviewed staff-grant operation. Independently sign in as B in a separate browser profile. Verify both owners can read their own session and perform an approved synthetic security change. Verify neither profile receives an Admin/tutor session. Preserve the two independent profiles for recovery tests. The old one-argument bootstrap signature no longer exists.

## Loss of all usable owners

First distinguish disabled recruitment grants, unverified Auth identities, password loss, MFA loss, provider outage and configuration failure. Do not restore access solely because a caller knows an email or Auth UUID.

After the authorization/evidence steps above, identify a verified, usable recovery identity through the approved Auth provisioning/recovery process. The function does not create an Auth user, set a password, confirm email, disable MFA or grant general Admin/teaching access.

```sql
begin;
select public.recruitment_operate(
 'recover_owner', 'OPERATOR_REFERENCE', 'INDEPENDENT_RECOVERY_APPROVAL',
 'Independent organizational approval and identity verification completed',
 p_target => 'RECOVERY_AUTH_UUID'::uuid
) as operational_event_id;
select user_id,role,enabled,revision from public.recruitment_staff
where user_id='RECOVERY_AUTH_UUID'::uuid;
select id,action,database_actor,operator_reference,approval_reference,target_user_id,created_at
from public.recruitment_operational_events order by created_at desc limit 1;
commit;
```

This explicitly approved operator procedure can restore an owner even while unusable owner rows remain. It is the documented exceptional authority, not an ordinary owner bypass. MFA enforcement remains unchanged. If MFA was lost, use the provider's separately approved factor-recovery process. An exceptional temporary suspension is a separate approval:

```sql
begin;
select public.recruitment_operate(
 'exception_suspend_owner_mfa', 'OPERATOR_REFERENCE', 'SEPARATE_MFA_RECOVERY_APPROVAL',
 'Time-limited owner recovery window approved with monitoring and closure plan'
);
commit;
```

This does not remove Supabase factors or alter project Auth settings. Suspend only when independently authorized, restrict operator/browser access during the window, and restore using `require_owner_mfa` after factor recovery. The operational controls do not auto-expire: the ticket must name the responsible person and closure deadline. Missed closure is an incident, not authorization to leave controls relaxed.

## Mandatory safeguards and MFA rollout

In isolated development, ordinary reviewed settings can still test the access fence off and on. After hosted acceptance and a separate production enforcement decision, the operator can lock safeguards:

```sql
begin;
select public.recruitment_operate(
 'lock_safeguards', 'OPERATOR_REFERENCE', 'ENFORCEMENT_APPROVAL',
 'Access-management compatibility accepted and enforcement explicitly approved'
);
commit;
```

The mandatory bit has no ordinary reset path. Normal owner feature changes cannot disable mandatory safeguards. An exceptional `exception_disable_safeguards` operation uses the same protected function with its own approval and reason, disables the staff console, and leaves the mandatory bit set. `restore_safeguards` restores enforcement. Record start/stop, monitoring, legacy grants made during the window and reconciliation before closing the exception. Missing singleton settings fail closed.

Before `require_owner_mfa`, enroll and verify TOTP factors for both independent test owners using the existing Supabase Auth provider's approved enrollment flow. No self-service enrollment or factor-reset UI ships in M1. Hosted enrollment tooling must keep sessions/seeds in memory and must not log them. Provider endpoints are `POST /auth/v1/factors` with `factor_type=totp`, then `POST /auth/v1/factors/{factorId}/challenge` and `/verify` with `challenge_id` and code; authenticate with the user's access token and project publishable/anon key, never the service key. Accept both owners' enrollment and recovery before enabling the requirement.

```sql
begin;
select public.recruitment_operate(
 'require_owner_mfa', 'OPERATOR_REFERENCE', 'MFA_ENFORCEMENT_APPROVAL',
 'Both owner enrollment recovery refresh and logout tests accepted on hosted Supabase'
);
commit;
```

Server enforcement validates the exact JWT with Supabase `/user` before deriving AAL2 from its subject, assurance, session and expiry claims. All owner mutations and challenge issuance require AAL2 when enabled. Owner reads/login remain available at AAL1. Per-action password confirmation creates and retains a fresh session; TOTP upgrades that fresh session when required. The proof binds to that replacement token. The previous session is locally logged out. Test single-session enforcement, expiry, refresh/downgrade and provider revocation semantics on the actual hosted project.

## Exceptional tutor replacement binding

First-time binding of an unbound tutor is unchanged. Once an identity has been established, its UUID history remains even after Auth deletion or clearing `user_id`. Migration backfills current UUIDs and recoverable immutable teaching history. Prior sign-in evidence without a recoverable UUID is quarantined and requires approval; inspect any other ambiguous legacy rows before hosted rollout. Replacement requires independent owner approval. This procedure only authorizes replacement on an existing enabled tutor; it cannot enable a tutor, create a tutor, change assignments or activate Admin access.

```sql
begin;
select public.recruitment_operate(
 'authorize_tutor_rebind', 'OPERATOR_REFERENCE', 'INDEPENDENT_OWNER_REBIND_APPROVAL',
 'Owner verified replacement identity and continuity of existing tutor record',
 p_target => 'REPLACEMENT_AUTH_UUID'::uuid,
 p_owner => 'APPROVING_OWNER_AUTH_UUID'::uuid,
 p_tutor => 'EXISTING_TUTOR_UUID'::uuid
);
commit;
```

The protected ticket must contain the approving owner's explicit consent and the exact prior/target/tutor UUIDs. An operator cannot infer approval from an enabled owner row. Approver must be an enabled verified recruitment owner different from the target UUID and a different person from the replacement account holder, verified independently by the operator. Authorization lasts one hour, is bound to the current established UUID, and is consumed atomically by normal `tutor_bind`. Current owner authority is checked again on consumption. Do not manually rewrite teaching identities or delete academic/audit history. Existing Auth audit FKs may correctly prevent deletion; do not remove them to make replacement easier.

## Post-recovery validation and closure

- Confirm the restored owner signs in and, if required, reaches AAL2 and completes a synthetic reviewed change; a fresh password alone must not satisfy required MFA.
- Establish/confirm the second independent owner. Review and revoke stale recruitment grants using normal owner operations, even if targets are unverified or unable to authenticate.
- Confirm pre-recovery disabled identities remain denied after email verification and refresh. Confirm unauthorized actors cannot use recovery RPCs, inspect another actor's request or approve their own replacement.
- Inspect `recruitment_operational_events` and the linked `recruitment_events.details.operationalEventId`. Preserve the event UUID, database principal, individual operator reference, ticket approval and validation results in the protected incident record. Historical bootstrap events from before this migration cannot be retroactively attributed; reconcile them with existing external records rather than inventing an actor.
- Verify safeguards/MFA settings, console state and all exceptional windows are closed. Revoke obsolete Auth sessions through the provider's approved procedure where needed; cookie deletion alone is not provider-wide session revocation.
- Confirm tutor record IDs, memberships, sessions, academic history and accounting journal/line totals are unchanged. Audit any approved replacement separately.
- Re-run negative browser/service-role privilege checks and record hosted provider behavior. Escalate an unsuccessful recovery rather than granting new application-role privileges or enabling public features.

## Unrecoverable browser request marker

The browser retains only the original request UUID. If a password-confirmation request never reached the server, recovery may have no saved choices. If the original actor has lost authority, recovery deliberately withholds choices. Do not replace the ID automatically. An authorized operator must check the exact actor/request UUID in `recruitment_requests`, `recruitment_events` and `recruitment_reauth_challenges`, resolve in-flight operations and record the confirmed outcome in the protected ticket. A completed operation must not be resubmitted with a new ID. If absence/non-application is established, the operator may instruct the user to clear only `sessionStorage['viva.recruitment.pendingRequestId']` and explicitly re-enter a reviewed operation. Never clear markers merely because a retry returns 401/403 or a gateway error. Browser-tab closure loses session storage; inspect audit/request history before recreating an uncertain operation from another tab/device.
