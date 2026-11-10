# Backend endpoint matrix (153 HTTP routes + WebSocket)

Read from every `*.controller.ts` on 2026-11-04. Counts per controller were checked against the decorators.

## How access is decided

- Global guards, in order: `ThrottlerGuard`, `JwtAuthGuard`, `UserRoleGuard` (`src/app.module.ts:110-112`).
- `@Public()` skips the JWT and role guards. `@DeviceAuth()` is `@Public()` plus `AppKeyGuard` and `DeviceTokenGuard` (`device-auth.ts:53-62`).
- A route with neither `@Auth` nor `@Public` gets 403 (`user-role.guard.ts:22`). No such route exists.
- `@Auth()` on a class applies to all its routes unless a handler overrides it (`getAllAndOverride`).
- With `mustChangePassword`, only `POST /auth/change-password` passes on HTTP (`user-role.guard.ts:26`). The WebSocket does not check it (see A8).
- Every authenticated and device route runs inside the caller's institution, with RLS on the connection (`tenancy.interceptor.ts:15-17`).

Roles: `A` ADMIN, `T` THERAPIST, `P` PARENT, `SA` SUPER_ADMIN, `Device` tablet.

"Beyond role" lists what the handler enforces after the role check. IDs such as A1 or B3 refer to the findings in the audit report.

## auth (`auth.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| POST /auth/login | Public; 3/s, 10/min | Lockout per e-mail + IP (5 in 15 min). Throttle bypass: B1 |
| POST /auth/refresh | Public; 120/min | Cookie, or body with X-App-Key. Atomic rotation, reuse detection (B6) |
| POST /auth/logout | Public; 20/min | Holder of the refresh token |
| POST /auth/forgot-password | Public; 3/min, 10/15 min | Timing and failure reveal the account: B4. Throttle bypass: B1 |
| POST /auth/reset-password | Public; 5/min | Hashed token, 30 min, single use. Older links stay valid: B4 |
| POST /auth/change-password | `@Auth()` any role; allowed with temporary password; 5/min | Own account, current password |
| PUT /auth/pin | T; 5/min | Own account, current password |

## users (`users.controller.ts`, `therapists.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /users | A | RLS only |
| POST /users | A | Role limited to T or P. Quota. Enables A6 |
| PATCH /users/:id | A | RLS. Last active admin guard. Deactivation cancels future appointments |
| DELETE /users/:id/pin | A | RLS |
| POST /users/:id/temporary-password | A | RLS. Enables A6 |
| GET /users/:id/patients | A | RLS |
| PUT /users/:id/patients | A | Patients checked under RLS. Does not touch appointments: A4 |
| GET /therapists | Device | Center of the tablet |
| POST /therapists/:id/pin-check | Device; 10/min | 5 failures lock 60 s, 10 void the PIN. Whole-row write: B3 |

## devices (`devices.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| POST /devices/registration-codes | A; 5/min | Current Center PIN. Quota |
| POST /devices/register | Public + AppKeyGuard; 10/15 min | Single-use code. Throttle bypass: B1 |
| GET /devices | A | RLS |
| POST /devices/:id/revoke | A | RLS. Does not close an open socket: A5. Can be undone by a race: B3 |
| GET /devices/settings | Device | Returns the Center PIN hash, by design |
| GET /devices/me | Device | Own tablet |

## patients (`patients.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| POST /patients | A | Consent bytes checked. Avatar and therapists checked under RLS |
| GET /patients | A, T | T forced to own patients; A sees all, no clinical fields |
| GET /patients/:id | T | Assigned. Audited |
| PATCH /patients/:id | T | Assigned. Audited |
| POST /patients/:id/discharge | T | Assigned. Audited. Cancels future appointments |
| POST /patients/:id/reactivate | T | Assigned. Audited |
| GET /patients/:id/consent | A, T | T must be assigned; A any in the center. Audited |

## profiles (`profiles.controller.ts`)

All routes: T and assigned to `:patientId`. Writes audited, reads not.

| Route |
| --- |
| GET /patients/:patientId/profile |
| PATCH /patients/:patientId/profile |
| PATCH /patients/:patientId/profile/pictograms/:pictogramId |
| POST /patients/:patientId/profile/categories |
| DELETE /patients/:patientId/profile/categories/:profileCategoryId |
| POST /patients/:patientId/profile/categories/:profileCategoryId/pictograms |
| DELETE /patients/:patientId/profile/pictograms/:pictogramId |
| PUT /patients/:patientId/profile/pictograms/:pictogramId/recording |
| DELETE /patients/:patientId/profile/pictograms/:pictogramId/recording |
| PUT /patients/:patientId/profile/categories/order |
| PUT /patients/:patientId/profile/categories/:profileCategoryId/pictograms/order |

## sessions (`sessions.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /patients/:patientId/sessions | T | Assigned. Audited |
| GET /sessions/:id | T | Assigned to the session's patient. Audited |
| GET /patients/:patientId/reports | T | Assigned. Audited |

## notes (`notes.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /patients/:patientId/notes | T | Assigned. Read not audited: A7 |
| POST /patients/:patientId/notes | T | Assigned; session must belong to the patient |
| PATCH /notes/:id | T | Assigned, author, within 24 h. Stores old text in the audit: A1 |
| PATCH /notes/:id/sharing | T | Assigned |
| GET /patients/:patientId/goals | T | Assigned. Read not audited: A7 |
| POST /patients/:patientId/goals | T | Assigned |
| PATCH /goals/:id | T | Assigned |

## homework (`homework.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /patients/:patientId/homework | T | Assigned. Read not audited: A7 |
| POST /patients/:patientId/homework | T | Assigned; pictograms from the board |
| PATCH /homework/:id | T | Assigned; pictograms from the board |
| DELETE /homework/:id | T | Assigned; not done yet |

## jobs (`jobs.controller.ts`; class-level `@Auth(T)`)

| Route | Access | Beyond role |
| --- | --- | --- |
| POST /patients/:patientId/reports/pdf-jobs | T | Assigned at enqueue and again in the worker. Audited in the worker |
| POST /patients/:patientId/export-jobs | T | Assigned at enqueue and again in the worker. Audited in the worker |
| GET /jobs | T | Own jobs only. No assignment re-check; URL not audited: A4 |
| GET /jobs/:id | T | Own jobs only. No assignment re-check; URL not audited: A4 |
| DELETE /jobs/:id | T | Own job, still queued |

## voices (`voices.controller.ts`)

All routes: T and assigned to `:patientId`. Create and delete audited.

| Route |
| --- |
| GET /patients/:patientId/voice |
| POST /patients/:patientId/voice |
| POST /patients/:patientId/voice/generate |
| DELETE /patients/:patientId/voice |

## treatments (`treatments.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /treatment-progress | A, T | T forced to own patients. A gets `name: null` and no clinical text |
| GET /patients/:id/treatment-plan | A, T | T assigned; A any in the center. A receives free-text `notes`: A2. Not audited |
| PUT /patients/:id/treatment-plan | T | Assigned. Audited |

## appointments (`appointments.controller.ts`; class-level `@Auth(A, T)`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /appointments | A, T | T forced to own. A receives `notes`: A2 |
| GET /appointments/:id | A, T | T own only. A receives `notes`: A2 |
| POST /appointments | A, T | T only for self. Patient must be assigned to the specialist. Hours and overlaps |
| PATCH /appointments/:id | A, T | T own only, cannot hand over. Move re-checks assignment; notes-only edit does not |
| POST /appointments/:id/status | A, T | T own only. No assignment check |

## center (`center.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /rooms | A, T | RLS |
| POST /rooms | A | RLS |
| PATCH /rooms/:id | A | RLS |
| GET /center-hours | A, T | RLS |
| PUT /center-hours | A | RLS |

## dashboard (`dashboard.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /dashboard | A | Counts only |
| GET /dashboard/analytics | A, T | T forced to own figures |
| GET /dashboard/patients | A, T | T forced to own; `correctRate` only for T. A gets names and practice minutes |
| GET /dashboard/usage | A, T | T forced to own. A gets tap and phrase counts, filterable by therapist (A2) |

## data-requests (`data-requests.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| POST /patients/:patientId/data-requests | T | Assigned. Audited |
| GET /data-requests | A, T | T limited to codes of assigned patients. Includes free-text `notes` |
| POST /data-requests/:id/complete | T | Assigned; rectification only. Audited |
| POST /data-requests/:id/reject | A | Open request. Audited |
| POST /data-requests/:id/execute-deletion | A | Open deletion request, typed patient code. Audited |

## family (`family.controller.ts`)

All routes: P and linked to the child. Only `GET /family/patients/:id` is audited on read (A7).

| Route | Beyond role |
| --- | --- |
| GET /family/patients | Own children |
| GET /family/patients/:id | Linked. Audited |
| GET /family/patients/:id/profile | Linked |
| GET /family/patients/:id/sessions | Linked. Exposes therapy session ids, which enables A3 |
| GET /family/patients/:id/notes | Linked; shared notes only |
| GET /family/patients/:id/homework | Linked |
| POST /family/homework/:id/complete | Linked to the homework's patient |
| POST /family/practice | Sessions must be for own children. Bypass into existing sessions: A3 |

## audit (`audit.controller.ts`)

All routes: A, center via RLS.

| Route | Exposure |
| --- | --- |
| GET /audit | Raw `summary`, including NOTE_UPDATE `previous`: A1 |
| GET /audit/csv | Raw `summary`: A1. Audited |
| GET /audit/xlsx | No `summary`. Audited; 10/min |
| GET /audit/pdf | No `summary`. Audited; 10/min |
| GET /audit/:id | Raw `summary`: A1 |

## catalogs (`catalogs.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /catalogs/:kind | A, T | Names only, no patient link |
| POST /catalogs/avatars | A | Bytes checked; SVG allowlist |
| POST /catalogs/:kind | A, T | Avatars admin-only in the use case |
| PATCH /catalogs/:kind/:id | A, T | Avatars admin-only in the use case |
| DELETE /catalogs/:kind/:id | A, T | Avatars admin-only in the use case |

## categories (`categories.controller.ts`)

All routes: T, center via RLS. Center-wide catalog, by spec.

| Route |
| --- |
| GET /categories |
| POST /categories |
| PATCH /categories/:id |
| GET /categories/:id/pictograms |
| POST /categories/:id/pictograms |
| DELETE /categories/:id/pictograms/:pictogramId |
| PUT /categories/:id/pictograms |

## pictograms (`pictograms.controller.ts`)

All routes: T, center via RLS. Center-wide catalog, by spec.

| Route |
| --- |
| GET /pictograms |
| GET /pictograms/arasaac |
| POST /pictograms/arasaac |
| POST /pictograms |
| PATCH /pictograms/:id |

## settings (`settings.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /settings | A | Never the PIN hash |
| PATCH /settings | A | Audited |
| PUT /settings/center-pin | A; 5/min | Current PIN to change it. Audited |
| GET /settings/branding | A, T | Name and logo |
| PUT /settings/logo | A; 10/min | PNG or JPEG by bytes, 512 KB, 2048 px |
| DELETE /settings/logo | A; 10/min | Audited |

## limits and subscription (`limits.controller.ts`, `subscriptions.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /limits | A | Own center |
| GET /subscription | A | Own center |
| GET /subscription/payments | A | Own center |
| GET /platform/payments | SA | All centers, no clinical data |
| GET /platform/institutions/:id/subscription | SA | |
| PATCH /platform/institutions/:id/subscription | SA | Audited in the center |
| GET /platform/institutions/:id/payments | SA | |
| POST /platform/institutions/:id/payments | SA | Audited in the center |
| POST /platform/institutions/:id/subscription/cancel | SA | Audited in the center |
| POST /platform/institutions/:id/subscription/reactivate | SA | Audited in the center |

## institutions (`institutions.controller.ts`)

| Route | Access | Beyond role |
| --- | --- | --- |
| POST /institution-requests | Public + PublicClientGuard; 5/h | Origin or X-App-Key, both filters only. Throttle bypass: B1 |
| GET /platform/dashboard | SA | Counts only |
| GET /platform/requests | SA | No contact data |
| GET /platform/requests/:id | SA | Contact data. Audited |
| POST /platform/requests/:id/review | SA | Audited |
| PATCH /platform/requests/:id/notes | SA | Audited |
| POST /platform/requests/:id/approve | SA | Returns the temporary password. Audited: A6 |
| POST /platform/requests/:id/reject | SA | Audited |
| GET /platform/institutions | SA | |
| GET /platform/institutions/:id | SA | Profile, admins, counts; no patients |
| PATCH /platform/institutions/:id | SA | Audited in the center |
| POST /platform/institutions/:id/status | SA | Audited in the center |
| POST /platform/institutions/:id/admins | SA | Returns the temporary password. Audited in the center: A6 |

## notifications (`notifications.controller.ts`; class-level `@Auth(SA, A)`)

All routes: the inbox comes from the credential, never from the request. RLS keeps a center's inbox inside it.

| Route |
| --- |
| GET /notifications |
| GET /notifications/unread-count |
| POST /notifications/:id/read |
| POST /notifications/read-all |

## sync, live, vocabulary, health

| Route | Access | Beyond role |
| --- | --- | --- |
| GET /sync/profiles | Device; 60/min | Center of the tablet. Code and board, no names |
| POST /sync/batch | Device; 60/min | Patient codes under RLS. Body not signed: B5 |
| GET /live/patients | A, T | T forced to own; no names or clinical fields |
| GET /vocabulary | Device | Center of the tablet |
| GET /health | Public | Status only |

## WebSocket `/ws` (`live.gateway.ts`), no HTTP guards or throttling

| Message | Access | Beyond role |
| --- | --- | --- |
| Connect, staff | `?token=<JWT>`, role A or T from the token | Active account. No `mustChangePassword` check: A8. Token in the URL: B6 |
| Connect, tablet | X-App-Key + device token + signature | Checked at connect only: A5 |
| `presence` | A, T | Account re-checked per message. T sees assigned, A sees all, code and status only |
| `watch` | T | Assigned at subscribe only, then streams until the socket closes (at most 15 min): A4. A refused |
| `batch` | Device | Same use case as POST /sync/batch. Device not re-checked: A5 |


## Added after this table was written

| Method | Path | Roles | Beyond the role |
| --- | --- | --- | --- |
| GET | `/patients/:id/administrative` | A | Same center by RLS. What the admin registered and the tablets used; no diagnosis, conditions or session content. Audited as `PATIENT_READ`. |
