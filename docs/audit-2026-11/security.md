# Security audit — Necon backend (caa-backend-pr) and web client (caa-web)

Date: 2026-11-03. Scope: `caa-backend-pr/src` (every controller, auth, tenancy, prisma, devices, common, users, institutions, data-requests, settings, dashboard, audit, sync/ws, jobs/worker), `prisma/schema.prisma`, every migration that touches RLS / roles / grants (`20261027000000_institutions`, `20261029000000_platform_admin`, `20261102000000_clinical_agenda`, `20261024010000_audit_insert_only`), `test/*.e2e-spec.ts` (names and assertions only), and `caa-web/src/shared/infrastructure/http/*`, `caa-web/next.config.ts`. Read-only; no `.env`, `.local-dev/*` or `accounts.json` was opened or quoted.

Method: read the files line by line, built the full route → guard → object-check table, traced every tenant-bypass call site (`asSystem`, `inInstitution`, `enterInstitution`, `$queryRaw`, `$executeRaw`, worker, WebSocket) and tried to disprove each candidate finding before keeping it. Findings that are only theoretical or that would require changing the tablet contract (`METHOD\npath?query\ntimestamp`, 401 = wipe token) are listed as accepted-risk notes, not as fixes.

Line numbers refer to the files as handed over (paths are relative to `caa-backend-pr/` unless prefixed with `caa-web/`).

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 11 |

No cross-tenant read or write path was found: RLS is enabled with a policy on every table that has `institutionId`, the API role is `NOLOGIN NOBYPASSRLS` and not the table owner, and every owner-pool (`asSystem`) call site was reviewed and is either a secret lookup (token hash, code hash, email+password) or a platform table. The e2e suite (`test/tenancy.e2e-spec.ts`) independently checks every route of A against B, direct SQL under the API role, and an injection attempt.

---

## Findings

### M1 — Behind the portal proxy every web user shares one IP: public-route throttles and audit IPs collapse (Medium)

**Where**
- `src/app.module.ts:59-73` — `getTracker`: requests without a valid `Bearer` are keyed `ip:${req.ip}`.
- `src/app.setup.ts:11` — `app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1))`.
- `compose.yaml:17` — production sets `TRUST_PROXY_HOPS: 0` ("published directly, without Nginx").
- `caa-web/next.config.ts:13-18` — every browser call is rewritten server-side to `API_URL` (`/auth/*` and `/api/*`), so the API's TCP peer for *all* portal users is the Next server.
- `caa-web/src/shared/infrastructure/http/api-client.ts:24-32` — `callRefresh` gives up after three 429/5xx and the session is dropped (`onSession(null)`).
- Throttles on public routes: `src/auth/infrastructure/http/auth.controller.ts:85,94,110,121,130` (login 10/min, refresh 20/min, logout 20/min, forgot-password 3/min, reset 5/min), `src/institutions/infrastructure/http/institutions.controller.ts:29` (5/hour).

**What is wrong**
With `TRUST_PROXY_HOPS=0` Express ignores `X-Forwarded-For`, so `req.ip` for every request coming through the portal is the portal server's address. All unauthenticated portal traffic therefore shares a single rate-limit bucket, and every audit row written for a web action (`ip` column, e.g. `LOGIN_SUCCESS`, `PATIENT_READ`) carries the portal's IP, not the person's. Raising the hop count to 1 does not fix it either: the API is published directly, so a tablet or any client could then forge `X-Forwarded-For` (the compose comment says exactly this).

**Concrete failure scenarios**
1. Anyone who can reach the portal sends `POST /auth/login` 10 times per minute with any body (the portal forwards it). The API answers 429 to every web login for the rest of each minute → nobody can sign in through the web while this continues. Cost to the attacker: one `curl` loop, no account needed.
2. Normal use: `/auth/refresh` is 20/min per IP. On Monday at 08:00 twenty-five staff open the portal; each page load (and each extra tab) calls refresh. The 21st and later get 429, the client retries three times at 2 s intervals, then signs the person out. The same bucket is shared with `logout` and `forgot-password`.
3. Forensics: the audit log cannot tell which network a web action came from; the e2e tests rely on `X-Forwarded-For` to vary IPs (README:337), which production does not honour.

**Smallest fix (no contract change)**
Trust `X-Forwarded-For` only when the socket peer is the portal: `app.set('trust proxy', (ip) => trustedProxies.has(ip))` (Express accepts a function or an IP/CIDR list) with the portal host(s) in an env variable, and make the portal forward the client IP (Next's rewrite proxy forwards incoming headers; set `x-forwarded-for` from the request's remote address in `middleware.ts` if it is not already present — verify on the deployed stack). Tablets still hit the API directly and their `X-Forwarded-For` keeps being ignored. Independently, key the public-route throttles on `ip + email` for login/forgot-password so one portal user cannot exhaust the others.

### M2 — Staff WebSocket: JWT in the URL and never re-validated for the life of the socket (Medium)

**Where** `src/sync/infrastructure/ws/live.gateway.ts:56-67,110-137`.

**What is wrong**
- Staff authenticate with `?token=<access JWT>` in the query string (`:59`). URLs are written to reverse-proxy access logs and browser history; a 15-minute bearer token therefore lands in logs.
- The token is verified once at connect (`:61-63`); afterwards the socket keeps streaming for as long as it stays open. Nothing re-checks expiry, `active`, role, institution or `mustChangePassword`. `onStaff` uses `isAdmin` from the JWT claim captured at connect (`:65`), not from the database, unlike every HTTP route (`jwt.strategy.ts:22-27` re-reads the user per request).
- `getUser.execute` (`:63`) checks `active` but not `mustChangePassword`, so an account on a temporary password can subscribe to `presence`/`watch` although every HTTP route is blocked by `UserRoleGuard` (`user-role.guard.ts:26-27`).

**Concrete failure scenario**
A therapist opens the live view at 09:00 and leaves the tab open. At 09:30 the admin deactivates her (`PATCH /users/:id {active:false}`), which revokes her refresh tokens and makes every HTTP call fail within 60 s. Her WebSocket keeps receiving `events`/`results` of the children she watches (pictogram taps, words spoken, activity answers) for hours, until the tab is closed. The same holds for a therapist un-assigned from a patient after `watch` was accepted (`isAssigned` is only checked at `watch` time, `:121`).

**Smallest fix (no tablet change)**
Keep the device branch untouched. For the staff branch: (a) accept the token from the `Sec-WebSocket-Protocol` header or as the first message instead of the query string; (b) store `exp` and close the socket with 4401 when it passes (a `setTimeout` per connection), and on each `presence`/`watch`/push re-check `getUser` (60 s cached already) and `isAssigned` before sending; (c) reject `mustChangePassword` accounts at connect. The web client does not currently open a WebSocket (no `WebSocket(` in `caa-web/src`), so this changes only the backend and the mobile staff view.

### M3 — Anyone can lock a known staff account out for 15 minutes, indefinitely (Medium)

**Where** `src/auth/application/login.use-case.ts:26-30,43-46`, `src/auth/domain/entities/login-attempt.entity.ts:28-40`, `src/auth/infrastructure/prisma/auth.prisma.repository.ts:70-82`.

**What is wrong**
Failed logins are counted per e-mail, globally, with no IP or device dimension; 5 failures in 15 min lock the e-mail for 15 min, and the lock is enforced before the password is checked (`:27`). The design note says this is intentional so the lock does not reveal which e-mails exist, but it turns the lock into a free denial-of-service primitive against any named person.

**Concrete failure scenario**
An outsider learns `director@centro.org` (it is on the centre's website). Every 15 minutes they send five `POST /auth/login` with any password (well under the 10/min throttle). The director can never sign in — on the web or the app — and the lock also fires on the correct password (`test/auth.e2e-spec.ts:36` asserts exactly this). Nothing tells the admin why; the audit shows `LOGIN_FAILED … LOCKED` rows from the attacker's IP (or, per M1, from the portal's).

**Smallest fix**
Keep the per-e-mail counter for the response-shape guarantee, but scope the *lock* to `(email, ip)` (or `(email, X-App-Key presence)`), and/or let a successful password reset or a correct password after N minutes clear it; alternatively replace the hard lock with exponential delay. None of this touches the tablet.

---

### L1 — Centre PIN hash is handed to every tablet and is crackable offline (Low — contract constraint)

`src/settings/application/settings-view.ts:24-28`, `src/settings/infrastructure/security/pbkdf2-center-pin.hasher.ts:11-15`, served by `GET /devices/settings` (`devices.controller.ts:79-84`).
PBKDF2-SHA256 with 100 000 iterations over a 4–6 digit PIN (≤ 1.1 M candidates) is about 1.1·10¹¹ SHA-256 — minutes on one GPU, hours on a laptop. Any holder of a device token (every registered tablet, or anyone who extracted one) recovers the centre PIN offline. This is inherent to offline verification on the tablet and cannot be changed without changing the tablet; the mitigation is policy: never gate anything server-side on the centre PIN alone (today `POST /devices/registration-codes` also requires an ADMIN session — keep it that way), and tell the handover team that the centre PIN has the security of a registered tablet, not of a secret.

### L2 — Device signature covers method, path and timestamp only; 5-minute replay window, no nonce (Low — contract)

`src/devices/application/authenticate-device.use-case.ts:28-31`.
A captured request can be replayed for ±5 min and its body can be altered without invalidating the signature. TLS makes this a MITM-only attack and the code comment acknowledges it. Do not change the signed string. A server-side `(deviceId, timestamp, signature)` seen-set with 5-minute TTL (Redis is already present) would block replays without any tablet change; body integrity stays TLS-only.

### L3 — WebSocket batch is validated without `whitelist` (Low)

`src/sync/infrastructure/ws/live.gateway.ts:100-102` (`validate(batch)`), consumed by `src/sync/application/process-batch.use-case.ts:36,55,74` (`{ patientCode, homeworkId, ...session }` then spread into Prisma `createMany`).
Over HTTP the global `ValidationPipe({ whitelist: true })` strips unknown keys; over the socket they survive. A tablet can therefore set any real `Session`/`Event`/`ActivityRun`/`ActivityResult` column that the use case does not overwrite: `receivedAt` (forged receipt time) and `institutionId`. The latter is stopped by the RLS `WITH CHECK` (the whole batch then fails with `InternalServerError`), which I confirmed against the policy in `20261027000000_institutions/migration.sql:294-296`; an unknown key makes Prisma throw, also failing the batch. Fix: `validate(batch, { whitelist: true })` (one line; same contract).

### L4 — Login CSRF through a cross-site form POST (Low)

`src/auth/infrastructure/http/auth.controller.ts:84-91`, cookie options `:23-29`.
`SameSite=Strict` stops the cookie from being *sent* cross-site, not from being *set* by a top-level cross-site form POST, and Nest's default body parser accepts `application/x-www-form-urlencoded`. An attacker page can submit `email/password` of an attacker-owned account to `https://portal/auth/login`; the victim's browser now holds the attacker's refresh cookie, and the portal's next `/auth/refresh` logs the victim into the attacker's account (the web restores sessions from the cookie, `session-context.tsx:39`). Impact is limited to classic login-CSRF (victim acts inside the attacker's tenant). Fix: require `Content-Type: application/json` on `/auth/*` (reject urlencoded) or check `Origin`/`Sec-Fetch-Site` on login; the mobile app sends JSON already.

### L5 — Admin can read two free-text clinical fields (Low — policy)

`src/treatments/application/get-treatment-plan.use-case.ts:12-13` (admin bypasses `isAssigned`; plan has `notes VARCHAR(500)`), `src/appointments/application/list-appointments.use-case.ts:12-13` and `get-appointment.use-case.ts:11-15` (admin sees all appointments including `notes VARCHAR(500)`).
Everything else honours "admin never sees clinical data" (patients list, dashboard, data requests). These two notes fields are written by therapists and will contain clinical remarks. Decide whether they are clinical; if yes, hide `notes` from the admin projection.

### L6 — Personal data can reach server logs (Low)

- `src/common/filters/global-exception.filter.ts:69,89,97` logs `request.url` on every domain/db/unhandled error. Searches carry names: `GET /patients?search=Juan%20Perez`, `GET /treatment-progress?search=…`, `GET /dashboard/patients?search=…`. A 404/400/500 on such a call writes the child's name to the log.
- `src/auth/infrastructure/mail/auth.mailer.ts:67,82` logs the recipient e-mail when SMTP is not configured (dev only; production refuses to start without SMTP, `:21-23`).
Fix: log `request.path` (or strip the query) in the filter.

### L7 — `.env` present in the handover directory (Low — hygiene)

`caa-backend-pr/.env` exists next to `.env.example` (listed by `ls`, not opened). It is git-ignored, but the folder is being handed to another team as files. Exclude it from the handover and rotate `JWT_SECRET`, `APP_KEY`, `CONSENT_ENCRYPTION_KEY`, SMTP and S3 credentials if the folder has already been shared.

### L8 — Public institution-request endpoint confirms whether a RUC is registered (Low — info)

`src/institutions/application/request-institution.use-case.ts:22-23` returns distinct `409 InstitutionExists` / `409 RequestAlreadyPending`. 5 requests/hour/IP (and M1 applies). RUC is a public tax identifier, so impact is small; if unwanted, answer 202 regardless and notify by e-mail.

### L9 — WebSocket has no payload cap or per-message throttle (Low)

`src/app.setup.ts:17` (`new WsAdapter(app)` with `ws` defaults: `maxPayload` 100 MiB), `live.gateway.ts:97-108`. HTTP batches are capped by the body parser and `ThrottlerGuard`; socket batches are not. Only authenticated devices/staff can connect. Fix: `new WsAdapter(app, { maxPayload: 1_000_000 })` and a simple per-socket token bucket.

### L10 — Access tokens outlive logout / password change / deactivation for up to 15 min (Low — informational)

`auth.module.ts:33` (`JWT_ACCESS_TTL` 15 m), `get-authenticated-user.use-case.ts`, `auth.prisma.repository.ts:39-45` (60 s cache, invalidated on every user write). Refresh tokens are revoked immediately; access tokens are stateless. Deactivation takes effect within ≤ 60 s because `saveUser` clears the cache. Acceptable; documented here so the next team does not expect instant logout.

### L11 — Registration-code PIN check brute force by an authenticated admin (Low)

`devices.controller.ts:48` (5/min) + `create-registration-code.use-case.ts:27`. A 4-digit centre PIN is exhaustible in ~33 h by an admin who does not know it. Attacker must already be an ADMIN of that centre. Add a per-user failure counter like the therapist PIN (`user.entity.ts:139-148`).

---

## What was checked and found correct

### 1. Cookies and sessions
- One cookie: `refresh` — `httpOnly`, `Secure`, `SameSite=Strict`, `Path=/auth`, `expires` = refresh expiry (7 days) (`auth.controller.ts:23-29`). Set on login, refresh, change-password; cleared on logout and on any refresh failure except `RefreshRaceLost` (`:104`).
- Refresh token: 32 random bytes base64url (`jwt-token.service.ts:27-29`), only its SHA-256 stored (`:31-33`), rotated on every use atomically (`auth.prisma.repository.ts:94-103`, conditional `updateMany` so concurrent rotations have one winner). Reuse of a rotated token after the 30 s grace revokes **all** of the user's refresh tokens (`refresh-session.use-case.ts:25-29`); inside the grace it is a 401 without revocation (two tabs / retry). Verified by `test/auth.e2e-spec.ts:59`.
- Expired/unknown refresh → 401 and cookie cleared. Deactivated user or deactivated institution → all tokens revoked (`:34-37`, `activeInstitution` filter `auth.prisma.repository.ts:15`).
- Password change (self), reset by e-mail, and admin temporary password all revoke every refresh token in the same transaction (`:109-118,130-143`, `assign-temporary-password.use-case.ts:23`). E-mail change and deactivation also revoke (`update-user.use-case.ts:61`).
- Access token: HS256 only (`jwt.strategy.ts:18`, `jwt-token.service.ts:20`), 15 min, claims `sub/role/typ:'access'`; `typ` is checked (`:23`), role and institution are re-read from the DB per request (`get-authenticated-user.use-case.ts`), so JWT claims are never trusted for authorisation over HTTP.
- Web: access token lives only in a module variable (`caa-web/src/shared/infrastructure/http/api-client.ts:10`), never in `localStorage`/cookies (grep confirmed; `localStorage` is used only for UI preferences). All calls go same-origin through Next rewrites, so the cookie is first-party; refreshes are serialised per tab and across tabs with Web Locks (`:34-51`).
- Mobile path: refresh token in the body only when `X-App-Key` matches (constant-time compare, `auth.controller.ts:69-72`); cookie takes precedence over body (`:81`). Tested (`auth.e2e-spec.ts:87,102`).
- CSRF: state-changing routes need the `Bearer` header (not a cookie), so they are not CSRF-able; `/auth/refresh` and `/auth/logout` are cookie-based but `SameSite=Strict` blocks cross-site sending. Only login CSRF remains (L4).

### 2. Tenant separation
- **RLS coverage**: migration `20261027000000_institutions/migration.sql:284-302` enables RLS and creates `institution_isolation` on every table that had `institutionId` at that time (loop over `information_schema.columns`), with `USING`+`WITH CHECK`; `User` and `AuditLog` additionally allow `institutionId IS NULL` rows when the connection has no institution (super admin / platform events). Later tables each got their own policy: `Notification`, `Appointment` (`20261029000000_platform_admin:379-386`), `Room`, `CenterHours`, `TreatmentPlan`, `Subscription`, `SubscriptionPayment` (`20261102000000_clinical_agenda:515-531`). `Institution` has a policy `id = current_institution()`; `InstitutionRequest` has RLS enabled with **no** policy and `REVOKE ALL` for the API role → invisible to tenants (default deny). Cross-checked against `schema.prisma`: the only models without `institutionId` are `RefreshToken`, `PasswordReset`, `LoginAttempt` (keyed by random hash / e-mail; only reached via the owner's secret) and `Institution`. No table with `institutionId` lacks a policy.
- **Forced?** No table uses `FORCE ROW LEVEL SECURITY`. This is intentional: the owner must bypass RLS for `asSystem` (platform, token lookups). The API role `necon_app` is `NOLOGIN NOBYPASSRLS` and does not own the tables (`:265-271`); the e2e test `tenancy.e2e-spec.ts:383` asserts exactly this (RLS on every `institutionId` table, API role not owner, no bypass).
- **Connection scoping** (`src/prisma/prisma.service.ts:15-61`): every connection taken inside a request runs `SET ROLE necon_app; SELECT set_config('app.institution_id', …, false)`; the value is UUID-validated before being inlined (`:17`) so it cannot inject. State is cached per connection and re-sent when the institution differs; a connection that errors is destroyed (`:39,52`). Pooled DATABASE_URLs are refused (`:70-71`) because this is session state. Owner pool is used only when there is no scope or `scope.system` (`:30`).
- **Tenancy interceptor** (`tenancy.interceptor.ts`): institution comes only from `req.user` / `req.device`, never from body/query/header (asserted by `tenancy.e2e-spec.ts:276`). Public routes start with `''` → RLS shows nothing until the use case calls `enterInstitution` after a secret check (login, refresh, reset, device register).
- **Every `asSystem` site reviewed**: `findAccount`/`findAccountsByEmail` (JWT/login lookups by id/e-mail+password), `findCodeByHash`, `findDeviceByTokenHash` (secret hashes), `institutionRequest`/`institution`/`subscription*`/`notification.create` (platform tables, SUPER_ADMIN routes only), `health` probe, and `approve()` which creates a new institution and explicitly sets `app.institution_id` transaction-locally before copying template catalogues (`institutions.prisma.repository.ts:98`). None reads tenant clinical data for a tenant caller.
- **Raw SQL**: all `$queryRaw`/`$executeRaw` are tagged templates (parameterised); dynamic ORDER BY comes from a fixed enum map (`dashboard.prisma.read-model.ts:29-35`); no `Prisma.raw`/`queryRawUnsafe` anywhere; all run under the request scope (RLS), except `claimNext` in the worker (`jobs.prisma.repository.ts:63`), which deliberately scans the whole queue and then runs the job inside `inInstitution(job.institutionId)` (`jobs.worker.ts:58`); handlers re-check assignment (`jobs.use-cases.ts:30`, `document-job.handlers.ts`).
- **WebSocket**: every message and close handler runs inside `inInstitution(...)` of the device or user (`live.gateway.ts:66-67,80-82,93-95`); presence fan-out filters viewers by `institutionId` (`in-memory-live-feed.ts:57-58`); tested `tenancy.e2e-spec.ts:342,363`.
- **Can A read B?** No path found. Lists are RLS-scoped; by-id lookups return null under RLS → 404; references to B's rows in A's bodies are rejected (`tenancy.e2e-spec.ts:252`); tablets download only their institution (`:295`); registration code fixes the tablet's institution forever (`register-device.use-case.ts:30`). Super admin (institution `null`) sees only `institutionId IS NULL` rows under RLS and uses owner-pool platform queries that never select patient data (`institutions.prisma.repository.ts` returns counts; `GetInstitution` comment and code).

### 3. Access control (route table)
All 150+ handlers carry `@Auth(...)`, `@Public()` or `@DeviceAuth()`; a handler without one is rejected by `UserRoleGuard` (`user-role.guard.ts:22`, default deny). Guard order: throttler → JWT → role (`app.module.ts:110-112`). Object-level checks verified per route:
- **Therapist ↔ patient**: `isAssigned(patientId, therapistId)` (TherapistPatient) is enforced in patients get/update/discharge/reactivate/consent, profiles (all 12 routes via `GetProfile`/`EditBoard`/`SetRecording`), notes & goals (every action, including by-id ones which resolve `note.patientId` first), homework, sessions list/detail/report (detail resolves `session.patientId`), voices, data-requests create/complete/export, jobs enqueue, treatment plan get/put, live `watch`, dashboard (therapist filter forced to `actor.id` regardless of query). Appointments: therapist always filtered to own id; `assertOwnAppointment` on get/update/status; booking checks assignment (`appointment-rules.ts:32-33`).
- **Admin**: creates patients/users, lists patients without clinical fields, reads consent image (audited), audit log, settings, devices, data-request reject/execute-deletion (with patient-code confirmation), subscription read. Cannot call `GET /patients/:id`, `/profile`, `/notes`, `/sessions`, `/voice` (THERAPIST-only). Cannot change roles (no `role` in `UpdateUserDto`). Cannot deactivate the last admin. Cannot touch SUPER_ADMIN rows (RLS: `institutionId IS NULL` not visible when the connection has an institution).
- **Parent**: every `/family/*` route checks `GuardianPatient` link (`family.use-cases.ts:32-34`); home practice batches are restricted to own children and own sessions (`process-batch.use-case.ts:31,39,62`); `completeHomework` resolves the homework's patient first. Parents reach no `/patients/*` route.
- **Super admin**: `/platform/*` and `/notifications` only; `@Auth(Role.ADMIN)` routes reject it.
- **Devices**: `AppKeyGuard` + `DeviceTokenGuard` (token hash + ECDSA P-256 signature + ±5 min timestamp); revoked tablet → 401 immediately (cache cleared on save); suspended institution → **403**, never 401, so tablets do not wipe their token (`devices.exceptions.ts:17-22`). Therapist PIN check: argon2id hash, 10/min per device, 60 s lock every 5 failures, PIN revoked at 10 (`user.entity.ts:139-148`), wrong PIN is 400 not 401 (`users.exceptions.ts:16-17`).

### 4. Injection, files, SSRF, logs, secrets, limits, headers
- **SQL**: Prisma query builder + tagged raw templates; search strings go through `contains`/parameters; injection tested cross-tenant (`tenancy.e2e-spec.ts:415`).
- **Uploads**: type detected from magic bytes, never from client MIME/filename (`pictogram.entity.ts:52-61`); PNG/JPEG dimensions parsed from headers and capped at 4096 px (pixel-bomb protection); size caps per route via Multer `limits` (logo 500 KB, avatar 200 KB, pictogram/consent/recording 1 MB, voice sample 10 MB); storage keys are server-generated UUID paths (`avatars/`, `pictograms/uploads/`, `recordings/`, `consents/`, `logos/<institution>/`, `jobs/<id>/`) — no user-controlled path component, no traversal.
- **SVG** (avatars only, admin only): element allow-list + rejection of `<!`, `&#`, `on*=`, `href=`, `javascript:`, non-fragment `url(` (`create-catalog-item.use-case.ts:14-20`); logo refuses SVG outright. Served from the bucket origin via signed URLs, not from the API/portal origin. Tested (`uploads.e2e-spec.ts:84`, `svg-avatars.e2e-spec.ts`).
- **Consent images**: AES-256-GCM with server key, `iv|tag|data`, served only through the API with `Cache-Control: no-store` after an audited access check (`encrypted-consent.vault.ts`, `patients.controller.ts:86-92`).
- **SSRF**: outbound HTTP only to fixed hosts (`arasaac.endpoints.ts`, `clone-voice.endpoints.ts` from env); ids are numeric or URL-encoded; no user-supplied URL is fetched anywhere. ffmpeg/ffprobe are invoked with `execFile` and an argument array (no shell), on temp files, with timeouts; audio-only output limits playlist/demuxer tricks.
- **CSV/XLSX injection**: `csvCell` prefixes `= + - @ \t \r` and quotes (`csv-cell.ts`); XLSX cells are `inlineStr` with XML escaping (`xlsx.ts`). PDFs are built with pdfmake from text nodes (no HTML).
- **E-mail**: HTML bodies escape user text (`auth.mailer.ts:6`); institution-request fields reject `<`, `>` and control characters (`institutions.dto.ts:14-15`); reset link token is URL-encoded.
- **Secrets**: none hard-coded; all from env (`JWT_SECRET`, `APP_KEY`, `CONSENT_ENCRYPTION_KEY` validated to 32 bytes, SMTP, S3). Swagger only outside production (`main.ts:15-23`). Stack traces only outside production (`global-exception.filter.ts:102`).
- **Password handling**: argon2id (`argon2-password.hasher.ts`), policy ≥10 chars with letters and digits, same code path and dummy-hash verify for unknown e-mails (timing), temporary passwords force change via `UserRoleGuard`, reset tokens 30 min single-use (conditional update), platform-generated temp passwords from CSPRNG (`institution-request.entity.ts:67-73`).
- **Enumeration**: identical 401 body for unknown e-mail / wrong password / inactive (`InvalidCredentials` safe message; tested `auth.e2e-spec.ts:21`); forgot-password always 204 (`:110`); `ChooseInstitution` lists institutions only after a correct password.
- **Rate limits**: global 10/s, 50/10 s, 200/min keyed per user (valid JWT), per device token hash, else per IP; tighter per-route limits on login, refresh, forgot/reset, PIN checks, registration codes, device register (10/15 min), institution requests (5/h), exports. (See M1 for the proxy caveat.)
- **CORS**: explicit origin list, credentials, limited headers/methods (`app.setup.ts:21-27`); `X-App-Key` is not an allowed CORS header, so browsers cannot impersonate the app. **Helmet** defaults on the API; portal sets `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader:false` (`caa-web/next.config.ts:19-31`).
- **Audit**: insert-only at the DB level (trigger + `REVOKE UPDATE, DELETE`, `20261024010000`/`20261027000000:278`); every clinical read is recorded with the patient code, never the name; `ip` from `req.ip` (see M1).
- **Data deletion** (LOPDP): single transaction, cascades, retired code pushed to tablets, optional anonymisation that also strips therapist/guardian (`patient-eraser.prisma.ts`), bucket files removed afterwards with failures logged.
- **Worker**: separate process, claims with `FOR UPDATE SKIP LOCKED`, runs each job inside its institution, re-checks requester activity and assignment, results in bucket with 5-minute signed URLs for the requester only, 24 h TTL cleanup.

### 5. Tablet contract
Preserved and verified: signature string is `${METHOD}\n${originalUrl}\n${timestamp}` with `originalUrl` = path **and** query (`device-auth.ts:47`, `authenticate-device.use-case.ts:30`); WebSocket signs `GET\n/ws\n<ts>` (`live.gateway.ts:76-77`). `DeviceUnauthorized` is the only 401 on device routes (`devices.exceptions.ts:24-28`); `InvalidAppKey` is 403, `InstitutionSuspended` is 403, wrong therapist PIN is 400, PIN lock is 429, batch too large is 413, DB down is 503 (`global-exception.filter.ts:87-96`). None of the fixes proposed above changes a status code, header, path or signed string that the tablet depends on; M2/L3/L9 touch only the server side of the WebSocket (device messages keep the same shape and `ack`/`error` responses).

## Appendix — files read in full
`src/main.ts`, `src/app.setup.ts`, `src/app.module.ts`, `src/worker.ts`, `src/worker.module.ts`, `src/prisma/*`, `src/tenancy/*`, `src/auth/**` (all), `src/devices/**` (all), `src/common/**` (all), `src/users/**` (all), `src/institutions/**` (all), `src/data-requests/**` (controller, all use cases, eraser, zip), `src/settings/**` (all), `src/dashboard/**` (controller, use cases, ports, read-model head), `src/audit/**` (controller, use cases, repository), `src/sync/**` (all), `src/jobs/**` (all), `src/patients/**` (controller, use cases, repository, vault), `src/profiles/**` (ports, controller, set-recording, audio converter, `isAssigned`), `src/family/**`, `src/notes/application`, `src/homework/application`, `src/sessions/application` + controller, `src/treatments/application`, `src/appointments/application` + controller, `src/catalogs` (controller, create), `src/pictograms` (controller, use cases, ARASAAC client, entity), `src/voices` (controller, create, clone client), `src/notifications` (controller, repository), `src/limits`, `src/health`, `src/vocabulary` controller, every other controller for its decorators; `prisma/schema.prisma` (models with/without `institutionId`, Session/Event/Patient/AuditLog/Job), the four RLS/grant migrations; `caa-web/next.config.ts`, `caa-web/src/shared/infrastructure/http/api-client.ts`, grep of token/cookie/WebSocket usage in `caa-web/src`; e2e test names in `test/tenancy`, `auth`, `devices`, `uploads`, `svg-avatars`.
