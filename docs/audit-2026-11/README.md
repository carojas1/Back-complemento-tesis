# Audit of November 2026

Five independent, read-only reviews of this backend and of the web client, on 2026-11-03: security and tenancy, correctness, duplication and structure,
pagination and database access, and standards. Their full reports are in this folder and describe the code **before** the fixes below.

| Report | Result |
| --- | --- |
| [security.md](security.md) | 0 critical, 0 high, 3 medium, 11 low |
| [correctness.md](correctness.md) | 0 high, 4 medium, 13 low |
| [duplication.md](duplication.md) | About 1 % of lines duplicated, 260 files with Spanish comments |
| [pagination.md](pagination.md) | 34 paginated lists, all capped at 100; 10 queries without `take` that can grow |
| [compliance.md](compliance.md) | Control-by-control mapping; what code can and cannot satisfy |

## Fixed

| Finding | Fix |
| --- | --- |
| Security M1: everyone behind the portal shared one rate limit, so reloads signed people out | `TRUST_PROXY_HOPS` also takes a list; `refresh` limit raised to 120/min |
| Security M2: a staff socket outlived its token | Closes when the token expires; each request rechecks the account. The token in the URL remains (open below) |
| Security M3: anyone could lock a known account | The lock is per e-mail and address (migration `20261104000000`) |
| Security L3, L4, L6, L9 | Socket validation with `whitelist`, 2 MB payload cap, form posts to `/auth` refused, query strings out of the logs |
| Correctness M1: `/sync/profiles` could skip a board forever | The version is read first and caps the page |
| Correctness M2: a guardian could attach results to any run | Known runs count only inside the source's own sessions |
| Correctness M3: `to=2026-10-31` excluded that day | Bare dates are whole days of the center (`common/time/center-day.ts`) |
| Correctness M4: report weeks mixed UTC and UTC-5 | All buckets use the center's week |
| Correctness L1, L2, L5, L6, L7 | Socket whitelist, real changed fields in the audit, goal returned past 100, one accuracy formula, one weekday numbering |
| Pagination: five lists with unstable order | Tie-breaker on `id` |
| Pagination: missing indexes | Eight added in migration `20261104000000` |
| Compliance: no purge of sign-in records | The worker removes them 30 days after they expire |
| Duplication | `trim`, the sync version bump, the dashboard period and the time constants have one owner |
| Language | Comments, logs, internal errors, API documentation and test titles are in English. Text the end user reads stays in Spanish |

## Open, for the backend team to decide

| Item | Why it was left |
| --- | --- |
| Security L1, L2: PIN hash on tablets, device signature without nonce | Part of the tablet contract |
| Security L5: admin reads free text in treatment plans and appointment notes | Policy decision |
| Security L8, L11; staff socket token in the URL | Low; the portal does not use the staff socket today |
| Correctness L3, L4, L8 to L13 | Low; concurrency on plan limits, midnight closing, queue position, 500 instead of 409 on create races |
| `isAssigned` written four times; audit port living in `auth` (82 imports) | Safe but wide: better done by the module owners |
| Per-session counters instead of counting events | A schema change worth planning: `pagination.md`, win 2 |
| Multi-factor sign-in for admins, encrypted voice samples, key rotation | Top code-level gaps in `compliance.md`, section 14 |

## Tenant separation

Each center's rows live in one shared database and are separated by PostgreSQL row-level security, with the API running as `necon_app`
(`NOLOGIN NOBYPASSRLS`, not the owner). `test/tenancy.e2e-spec.ts` walks the routes across two centers. This is logical separation. A physically separate
database per center is a different architecture and has not been built.

## Standards

Software is not certified: organizations are. `compliance.md` lists what this code supports and what the organization still needs (data protection officer,
impact assessment, processor contracts, retention schedule, breach procedure), under ISO/IEC 27001:2022, 27002:2022, 27017:2026, 27018:2025, 27701:2025, ISO
27799:2025, ISO/IEC 29100:2024, 25010:2023, 40500:2025 and Ecuador's LOPDP. ISO/IEC 27010:2015 applies only marginally, to sharing agreements.

## Second review, 4 November 2026

A read-only review of every route, with the matrix in [role-matrix.md](role-matrix.md), and one of the web client. Each item was confirmed by reading the code; each fix below has a test.

### Fixed

| Finding | Fix | Test |
| --- | --- | --- |
| The API and the worker die when a connection is reset in the middle of a query: `ScopedPool.query` takes a client, and while it is checked out nobody listens to its `error` event | Both pools listen on `connect` (`prisma.service.ts`) | `connection-drop.e2e-spec.ts` cuts a real socket through a proxy; it fails without the fix |
| A made-up `Authorization: Device x` opened a new rate limit bucket on every request, on public routes too: sign-in, password reset, center requests | The bucket by device token applies only on `@DeviceAuth` routes (`deviceRouteKey`) | `auth.e2e-spec.ts` |
| The old text of an edited clinical note reached the admin through `GET /audit`, `/audit/:id` and the exports | It stays in the log and leaves `withNames` without it (`audit.prisma.repository.ts`) | `sessions.e2e-spec.ts` |
| The admin received the free text of a treatment plan | `notes: null` for the admin (`get-treatment-plan.use-case.ts`) | `clinical-agenda.e2e-spec.ts` |
| A specialist taken off a patient kept a fresh link to the export for 24 hours | `GET /jobs` and `/jobs/:id` still show the job, without the link (`jobs.use-cases.ts`) | `data-requests.e2e-spec.ts` |
| A tablet's request in flight could undo a revocation, because `touch` wrote the whole row. The same in the PIN check, with the user's password and status | `saveLastSeen` and `savePinState` write only their columns | `devices.e2e-spec.ts`, `pin.e2e-spec.ts` |
| A disabled tablet kept uploading on an open socket | `onBatch` checks it again and closes with 4401 (`live.gateway.ts`) | `sync.e2e-spec.ts` |
| A staff socket ignored `mustChangePassword` | Refused at connection | `sync.e2e-spec.ts` |
| Password reset waited for the mail server, so its time or failure told who has an account | Not awaited, and a failure is logged (`forgot-password.use-case.ts`) | `auth.e2e-spec.ts` |
| Older reset links stayed valid after a reset | A new password ends them all (`auth.prisma.repository.ts`) | `auth.e2e-spec.ts` |

Added for the portal: `GET /patients/:id/administrative`, admin only, audited, with no clinical data (`patients.e2e-spec.ts`).

### Open, for the team to decide

| Severity | Finding | Where | Smallest fix |
| --- | --- | --- | --- |
| Medium | A guardian can attach events to a therapy session by sending its id in `/family/practice` | `process-batch.use-case.ts:63` | Reject batch sessions that exist and belong to another source |
| Medium | Appointment `notes` are free text written by the specialist and reach the admin. The screen labels them logistics; nothing enforces it | `appointments.prisma.repository.ts:22` | Omit them for the admin, or keep the label and train people |
| Medium | An admin can create a specialist or set a temporary password, assign a patient to it, sign in and read the record. It is audited, not prevented. The super admin can chain this: two routes return temporary passwords | `users.controller.ts:54,76,96`, `institutions.controller.ts:84,130` | Stop returning passwords; notify the affected account |
| Medium | The tablet's signature leaves out the body and production publishes plain HTTP, so anyone on the center's network can replay or alter `/sync/batch` for 5 minutes | `authenticate-device.use-case.ts:30`, `compose.yaml:23-25` | TLS everywhere; sign a hash of the body. This changes the tablet's contract, so it needs both teams |
| Low | No read audit on notes, homework, treatment plan and family reads; `LIVE_WATCH` lacks code and IP | `notes.use-cases.ts:38,89`, `live.gateway.ts:133` | Record them |
| Low | A stale token on another device revokes the fresh session after a password change; the JWT travels in the socket's URL; voice service errors reach therapists | `refresh-session.use-case.ts:26`, `live.gateway.ts:60`, `voice-job.runner.ts:41` | One by one |

Not verified: whether `ffmpeg` parsing uploads without `-protocol_whitelist` is exploitable, the bucket's privacy (export ZIPs sit there unencrypted), whether a Redis outage hangs requests, and `TRUST_PROXY_HOPS` in the real deployment (1 in code, 0 in compose; 1 without a proxy allows spoofing an address).

### Round trips per read

Prisma loads relations level by level, so round trips equal nesting depth. Each one costs about 130 ms from Cuenca to Neon. On a server next to the database this should matter far less, but that was not measured.

| Read | Trips | Target |
| --- | --- | --- |
| `GET /sessions/:id` | 8 | 3 |
| `GET /treatment-progress` | 5 (610 ms measured) | 1, with a CTE and LATERAL |
| Profile and `/sync/profiles` | 5 | 2 |
| `GET /patients/:id`, `GET /family/patients/:id` | 5 | 2 |
| `GET /patients` | 3 (380 ms measured) | 1 |
| `GET /devices` | 3 (375 ms measured) | 1 |

`GET /dashboard` is already 1. On the write side, `process-batch.use-case.ts:53` runs one query per session in a loop. `relationJoins` would reach most targets, but it is a preview feature in Prisma 7.10.1 and was not tried with this adapter.
