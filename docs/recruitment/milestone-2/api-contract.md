# Vacancy API contracts

All private requests reuse `/api/admin/recruitment` and dedicated recruitment cookies. They never accept general Admin/tutor cookies as a substitute. Private responses use no-store. State-changing requests require same-origin JSON. No endpoint creates an applicant, sends email or accepts a file.

## Private reads

`GET ?route=vacancies` returns the caller's authorized vacancy page and current draft snapshots. Optional query: `search` (title/reference, max160), `status`, `category`, `offset` (zero-based). Up to50 records per page, `total` and `nextOffset` support navigation. Category/status filtering occurs after authorization in SQL.

`GET ?route=vacancies&vacancyId=<uuid>` returns the authorized selected record, version pointers, officer assignments, newest50 immutable versions and newest200 relevant audit events. `historyBefore=<versionNumber>` loads earlier versions. Responses include `historyBefore`/`versionsHasMore`; drafts are never exposed to a caller solely because they know the UUID.

Version history and public publication are distinct. A row can remain `status=published` while its `reviewState=draft` or `submitted` for a replacement version. `publishedVersionId` stays pinned to the approved public snapshot until owner republication.

## Mutations

1. Generate a stable UUID for the exact reviewed choices.
2. `POST ?route=reauthenticate` with `{operation,data,password}` and, when required, `{factorId,code}`. The response rotates the recruitment session and returns a five-minute action-specific proof.
3. `POST ?route=mutate` with `{operation,data,proof}`. Do not include the password/code here. Successful vacancy results contain `{result:{saved:true,...}}`.
4. A failed/uncertain response must retain the same request ID. Only a confirmed first-attempt application rejection establishes that it can be abandoned; a rejected retry cannot erase earlier uncertainty.
5. `GET ?route=recover&requestId=<uuid>` restores server-held choices or the completed status only for the currently authorized original actor. The browser persists only the UUID in session storage.

Every data object is strict and includes `requestId`. Every existing-vacancy mutation includes `vacancyId` and `expectedRevision`. This provides conflict handling independently from replay handling.

| Operation | Additional data | Authority |
| --- | --- | --- |
| `vacancy_create` | `scopeId` UUID or null, `content` | Owner or scoped manager; only owner may atomically create a new scope using null |
| `vacancy_save` | `content` | Owner, scoped manager, explicitly assigned scoped officer |
| `vacancy_submit` | `reason` (may be empty) | Same editing authority; complete content required |
| `vacancy_revise` | `reason` (may be empty) | Same scoped authority; approved/live vacancy only |
| `vacancy_return` | `reason` | Owner; submitted review only |
| `vacancy_approve` | `reason` (may be empty) | Owner; exact submitted version |
| `vacancy_publish` | `reason` (may be empty) | Owner; current approved version only |
| `vacancy_pause` | `reason` | Owner; published only |
| `vacancy_close` | `reason` | Owner; terminal closure |
| `vacancy_archive` | `reason` | Owner; closed only |
| `vacancy_assign` | `userId`, `enabled` | Owner/scoped manager; scoped verified enabled officer for new access; removal does not require target authentication |
| `vacancy_settings` | `expectedRevision`, `publicVacanciesEnabled` (no vacancy ID) | Owner; uses recruitment settings revision |

Reason fields are bounded; pause/close/return/archive require a meaningful reason. The UI asks for at least10 characters. Validation errors are returned as application rejections; stale revisions require refresh and a newly reviewed choice, except an identical completed request always returns its saved result after current authorization checks.

## Public reads

- `GET /api/careers`: at most20 approved published listings, `total` and `nextOffset`.
- `GET /api/careers?category=tutor&offset=20`: authorized-public category filter/page. Categories: `tutor`, `administrator`, `support_staff`.
- `GET /api/careers?slug=<stable-slug>`: one currently published approved vacancy; unavailable/paused/closed/flag-off returns404. Unsupported or mixed query fields are rejected.

The public projection contains only vacancy ID/reference/slug, approved content, immutable version number, publication time, availability and `acceptingApplications:false`. It never contains owner/staff references, internal scope, draft IDs, assignments, history or audit details. Content contains only structured vacancy requirements and future document/question descriptors; no applicant answers exist.

The default-off public flag suppresses all listings. Deadline availability is computed by the database: `opening_soon`, `open`, `closed`. This is informational vacancy availability, not active application intake.

Successful responses use a representation ETag and mandatory revalidation (`public, max-age=0, must-revalidate`). Every conditional request checks current database publication state before304. Feature/publication generation and deadline state changes alter the representation. Errors use no-store and no stale fallback.
