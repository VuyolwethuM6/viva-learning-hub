# Recruitment permissions

| Capability | Owner | Manager | Officer |
| --- | --- | --- | --- |
| Security snapshot while console disabled | Yes | No | No |
| Grant/revoke recruitment role | Yes, other identities | No | No |
| Create scope | Yes | No | No |
| Grant scope | Other identities | Enabled officers, only manager's own active scopes | No |
| Change rollout controls | Yes | No | No |
| See complete security directory/audit | Yes | No | No |
| Read assigned scopes | Yes | Yes | Yes |
| Hiring/rejection decisions | Not released | Not released | Not released |
| System activation | Not released | Not released | Not released |
| Public intake/uploads/compensation | Not released | Not released | Not released |

All grants require a verified existing Auth identity. M1 uses that identity's password for isolated login and fresh per-action confirmation. It does not create staff accounts. Managers can see enabled officer identities needed for delegation; they cannot see Auth users generally or owner audit events. Scope grants do not create general Admin/finance/teaching permissions.

Staff and scope changes use expected revisions. Owners cannot modify their own grants through normal operations. The last enabled owner cannot be removed via a normal transition. Ordinary users cannot bootstrap ownership; the bootstrap function is restricted to an authorized database operator, runs once and records the action. Recovery if all owners lose verified Auth access is an explicitly authorized operational procedure, never an HTTP bypass.

Every mutation rechecks current actor authority before replaying any stored result. Challenges cannot be transferred to another session, action or payload. Failed mutation transactions roll proof consumption back, permitting safe correction/retry. A completed identical request returns the existing result; changed reuse is rejected.

Audit/request records are append-only. Postgres/privileged database operators and a compromised server credential remain high-trust risks; this feature does not claim to defend against database-owner compromise. Never grant browser execution of functions accepting `p_actor` or other trusted service inputs.
