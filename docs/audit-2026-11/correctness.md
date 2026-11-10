# Correctness audit — caa-backend-pr (NestJS 11 + Prisma 7 + PostgreSQL)

Date: 2026-11-03. Scope: src/sync, sessions, appointments, patients, profiles, treatments, homework, notes, family, jobs,
subscriptions, limits, voices, vocabulary, pictograms, categories, catalogs, center, notifications, dashboard (incl.
patientUsage/appUsage), plus common/, tenancy/, prisma/, the device-settings endpoint, prisma/schema.prisma and the
migrations 20261027 → 20261103. Read-only; nothing in the project was modified. No .env / local.env / accounts.json opened.

Every finding below was traced through the code it depends on (DTOs, ValidationPipe config, RLS policies, Prisma
semantics) and an attempt was made to disprove it before listing it. Items that could not be confirmed without the tablet
app or a live database are not listed.

Totals: **High 0 · Medium 4 · Low 13**. The tablet contract (`items,page,limit,total,totalPages`, limit ≤ 100,
`/sync/profiles` and `/devices/settings` fields, multipart names `consentImage`/`image`/`audio`/`sample`,
`privacyNoticeVersion`) is unchanged by any suggested fix.

---

## Medium

### M1. `/sync/profiles` can skip a board change forever (version read is not atomic with the list)
- **File:** `src/sync/application/get-sync-profiles.use-case.ts:19-24`, with `src/profiles/infrastructure/prisma/profiles.prisma.repository.ts:221-234, 249-251`.
- **Defect:** `listBoardsChangedSince`, `dischargedCodesSince`, `retiredCodesSince` and `currentVersion` run in `Promise.all` on four different pool connections with no transaction. The list is `syncVersion > since` with no upper bound, and the `version` returned is whatever `GlobalSyncVersion` holds when its own query runs.
- **Inputs / wrong result:** GlobalSyncVersion = 10. Tablet calls `GET /sync/profiles?since=5`. The `profile.findMany` snapshot is taken (sees boards up to 10). Before `globalSyncVersion.findUnique` executes, a therapist saves profile Y (`saveSettings` → version 11, Y.syncVersion = 11, commit). Response: `items` without Y, `version: 11`. The tablet stores `since = 11`; Y is never delivered until Y changes again. Same race across pages: a profile edited between page 1 and page 2 moves to the end of the `syncVersion ASC` ordering and shifts page 2 by one, silently skipping one board.
- **Fix:** read `currentVersion()` first (sequentially), then run the lists with `syncVersion: { gt: since, lte: version }`. This makes paging stable and anything newer arrives on the next call (duplicates are harmless; the sync is idempotent).

### M2. A guardian can attach activity results to any run of the institution (`/family/practice`)
- **File:** `src/sync/application/process-batch.use-case.ts:139, 157-158` (vs. the guardian filter at `:142`).
- **Defect:** `known` sessions are filtered with `s.guardianId === guardianId`, so a guardian's *events* for foreign sessions are rejected. But `knownRuns = existingRuns(resultRunIds)` is looked up under the institution's RLS only, and `runSession` is built from `knownRuns` without checking that the run's session is in `known`. `activityResults` are then kept whenever `runSession.has(r.runId)`.
- **Inputs / wrong result:** PARENT account posts `POST /family/practice` with `sessions: [], events: [], activityRuns: [], activityResults: [{ id, runId: <runId of a THERAPY session of another patient>, targetPictogramId, chosenPictogramId, correct: true, firstAttempt: true, responseMs: 1, answeredAt }]`. Response `accepted.activityResults` contains the id and the row is inserted (FK satisfied). It now counts in that patient's session detail, report accuracy and dashboard `correctRate`.
- **Fix:** build `runSession` only from runs whose `sessionId` is in `patientOf` (i.e. `[...knownRuns.filter(r => patientOf.has(r.sessionId)), ...activityRuns]`), and reject the rest with `UnknownRun`.

### M3. Date-only `from`/`to` on sessions, reports, notes and PDF jobs exclude the whole last local day
- **File:** `src/sessions/infrastructure/prisma/sessions.prisma.read-model.ts:27-28` (`inPeriod`), `src/sessions/infrastructure/http/sessions.controller.ts:12-15`, `src/notes/infrastructure/prisma/notes.prisma.repository.ts:14`, `src/jobs/infrastructure/http/jobs.dto.ts:7-8`, `src/family/infrastructure/http/family.dto.ts:8-9`.
- **Defect:** The DTOs document date-only values (`example: '2026-10-31'`). `@Type(() => Date)` turns `2026-10-31` into `2026-10-31T00:00:00Z` and the filter is `startedAt <= to` / `createdAt lte to`. The center is UTC-5 and timestamps are UTC.
- **Inputs / wrong result:** `GET /patients/:id/sessions?from=2026-10-01&to=2026-10-31`. A session started 2026-10-31 10:00 Ecuador (15:00Z) is excluded; one started 2026-09-30 20:00 Ecuador (Oct 1 01:00Z) is included. The whole of Oct 31 (local) is missing from the list, from `GET /patients/:id/reports`, from the PDF job (`params.to` is the same ISO string) and from the notes filter. `report.sessions`/`minutes` are therefore undercounted for any month-end report.
- **Fix:** when `to` has no time component, normalise it to the end of that day in center time (`to + 1 day − 5h`, exclusive `<`), or document and require full ISO timestamps as the appointments/dashboard DTOs already do.

### M4. Report weeks are bucketed in UTC for sentences/accuracy but in UTC-5 for practice
- **File:** `src/sessions/infrastructure/prisma/sessions.prisma.read-model.ts:89, 93` vs `:100`.
- **Defect:** `weeks.meanSentenceLength` and `weeks.accuracy` use `date_trunc('week', e."occurredAt")` (UTC Monday), while `practiceByWeek` uses `date_trunc('week', s."startedAt" - interval '5 hours')` (Ecuador Monday). The PDF prints both as "Semana YYYY-MM-DD".
- **Inputs / wrong result:** A session on Sunday 2026-10-25 20:30 Ecuador (Monday 01:30Z): its sentences and activity results land in week `2026-10-26`, its minutes in week `2026-10-19`. Any session between Sunday 19:00 and midnight local is split across two adjacent week labels; `weeks` and `practiceByWeek` disagree on which weeks exist.
- **Fix:** subtract `interval '5 hours'` in the two `date_trunc('week', …)` expressions at lines 89 and 93 (as `refreshUsage`, the dashboard and `practiceByWeek` already do).

---

## Low

### L1. WebSocket batch accepts fields the HTTP path strips, then fails on them
- **File:** `src/sync/infrastructure/ws/live.gateway.ts:100-104`; compare `src/app.setup.ts:18` (`whitelist: true`).
- **Defect:** `plainToInstance(SyncBatchDto, message)` + `validate(batch)` without `{ whitelist: true }` keeps unknown keys on every nested DTO. `ProcessBatchUseCase` spreads the session/event objects (`{ patientCode, homeworkId, ...session }`, `{ ...e, payload }`) into `createMany`.
- **Inputs / wrong result:** Over `/ws`, `{ type:'batch', sessions:[{ …valid…, localId: 7 }], … }` → Prisma `Unknown argument localId` → ack `{ type:'error', error:'InternalServerError' }` for the whole batch. The same body over `POST /sync/batch` succeeds. A client sending `receivedAt` over WS also overrides the server timestamp.
- **Fix:** `validate(batch, { whitelist: true, forbidUnknownValues: false })` or `plainToInstance(..., { excludeExtraneousValues: true })` with `@Expose()`; or pick the known fields explicitly in `ProcessBatchUseCase`.

### L2. `PATCH /patients/:id` always "changes" and audits even when nothing changed
- **File:** `src/patients/domain/entities/patient.entity.ts:55-67`, called from `src/patients/application/update-patient.use-case.ts:30`.
- **Defect:** `edit(input)` receives the whole use-case input (`{ ...dto, id, therapistId, ip }`) and iterates `Object.keys(next)`. `therapistId` and `ip` are not patient props, so `same(next.therapistId, undefined)` is false → both are reported as changed and assigned onto the entity.
- **Inputs / wrong result:** `PATCH /patients/:id {}` by any assigned therapist: `changed = ['therapistId','ip']`, `patients.save` runs (new `updatedAt`), and an audit row `PATIENT_UPDATE` with `summary.fields = ['therapistId','ip']` is written. `columns()` drops the stray keys, so no DB corruption, but the audit trail is wrong on every no-op PATCH.
- **Fix:** iterate the editable keys only (as `profile.entity.ts` does with `editable`), or pass only the DTO to `edit`.

### L3. Plan limits can be exceeded by concurrent requests (read-then-write)
- **File:** `src/limits/domain/entities/quota.entity.ts:12-15` as used in `src/devices/application/register-device.use-case.ts:31`, `create-registration-code.use-case.ts:28`, `src/users/application/create-account.use-case.ts:32`, `update-user.use-case.ts:54`.
- **Defect:** `assertQuota(await quota.usage())` counts rows, then the insert happens in a separate statement with no lock or unique guard.
- **Inputs / wrong result:** `maxDevices = 5`, 4 active devices, two tablets redeem two valid codes at the same time: both see `used = 4 < 5` and both register → 6 devices. Same for therapists.
- **Fix:** do the count and the insert in one transaction with `SELECT … FOR UPDATE` on the `Institution` row (or a `pg_advisory_xact_lock(hashtext(institutionId))`).

### L4. Appointment ending exactly at local midnight is refused even when the center closes at 1440
- **File:** `src/appointments/application/appointment-rules.ts:22`; DTO allows `closesAt = 1440` (`src/center/infrastructure/http/center.dto.ts:59`, DB check too).
- **Inputs / wrong result:** CenterHours Friday `opensAt 0, closesAt 1440`. `POST /appointments` 23:00–00:00 Ecuador (04:00Z–05:00Z next day): `centerWeekday(endsAt)` is Saturday ≠ Friday → `OutsideCenterHours`, although the configured hours allow it.
- **Fix:** compute the end in minutes relative to the start day (`minuteOfDay(endsAt) + 1440 * (dayDiff)`) and compare with `closesAt`.

### L5. `PATCH /goals/:id` returns an empty 200 body once a patient has more than 100 goals
- **File:** `src/notes/application/notes.use-cases.ts:116` (also `:103` for create, which is safe because of `createdAt desc`).
- **Defect:** the response is `listGoals(page 1, limit 100).items.find(id)`; an updated goal older than the newest 100 is not on that page → `undefined` → HTTP 200 with no body.
- **Fix:** add a `findGoalRow(id)` to the repository and return it.

### L6. Dashboard `correctRate` uses a different denominator than the sessions report
- **File:** `src/dashboard/infrastructure/prisma/dashboard.prisma.read-model.ts:350, 379` vs `src/sessions/infrastructure/prisma/sessions.prisma.read-model.ts:16-17, 94`.
- **Inputs / wrong result:** 5 first-attempt answers (4 correct) + 5 retries: report/session detail → 80 %, `GET /dashboard/patients` → `correctRate: 40` (correct first attempts ÷ all answers). The two screens disagree for the same patient/period.
- **Fix:** `count(*) FILTER (WHERE r."firstAttempt")` as the denominator.

### L7. `byHour.weekday` uses ISO numbering (Mon=1…Sun=7) while every other weekday in the API is 0=Sunday
- **File:** `src/dashboard/infrastructure/prisma/dashboard.prisma.read-model.ts:427` vs `CenterHours.weekday` (0 = Sunday) and `centerWeekday()`.
- **Wrong result:** a client that renders `byHour` with the CenterHours convention puts Sunday sessions on a non-existent day 7 and shifts every other day by one.
- **Fix:** `extract(dow …)` (0 = Sunday) or document the ISO convention on the response type.

### L8. Job queue `position` is understated for every institution
- **File:** `src/jobs/infrastructure/prisma/jobs.prisma.repository.ts:47-52`.
- **Defect:** `ahead()` runs under the request's RLS, so it counts only the institution's own jobs, while the worker (`claimNext`, owner pool) serves one global queue per lane.
- **Wrong result:** institution A has 1 queued job, institution B has 20 older queued PDFs: A's job reports `position: 0` but will run after B's 20.
- **Fix:** run the count with `asSystem()` (it returns only a number, no cross-tenant data).

### L9. Create-if-absent checks without a unique guard return 500 instead of 409 under concurrency
- **Files:** `src/catalogs/application/create-catalog-item.use-case.ts:35` (`@@unique([institutionId,name])`), `src/pictograms/application/import-arasaac-pictogram.use-case.ts:20` (`@@unique([institutionId,arasaacId])`), `src/voices/application/create-voice.use-case.ts:50` (`patientId @unique`), `src/profiles/application/get-profile.use-case.ts:19-21` + `profiles.prisma.repository.ts:83` (`patientId @unique`), `src/profiles/infrastructure/prisma/profiles.prisma.repository.ts:144` (addCategory duplicate check).
- **Wrong result:** two simultaneous identical requests: the second gets `P2002` → `InternalServerError` (500); for voices the sample file is also left orphaned in the bucket (`storage.put` precedes `save`). Two simultaneous `GET /patients/:id/profile` on a patient without a profile: one gets 500.
- **Fix:** catch `P2002` and map it to the existing `CONFLICT` exceptions (as `center.prisma.repository.ts` already does for rooms).

### L10. Deactivating a pictogram keeps sending it to tablets, contrary to the endpoint's contract text
- **File:** `src/pictograms/infrastructure/http/pictograms.controller.ts:73` ("desactivar = deja de llegar a las tabletas") vs `src/profiles/infrastructure/prisma/profiles.prisma.repository.ts:11-23` (`board` include has no `pictogram.active` filter) and `touchBoards` (`pictograms.prisma.repository.ts:55-63`).
- **Inputs / wrong result:** `PATCH /pictograms/:id { active: false }` bumps the syncVersion of every board containing it; the next `GET /sync/profiles` returns those boards **with** the pictogram still present. Only `/vocabulary` and template copies filter it.
- **Fix:** decide the rule: either filter `pictogram.active` in `board` (and in `toProfileView`) or correct the Swagger text and `BoardItemNotFound` message.

### L11. Catalog delete / deactivate decisions are not atomic
- **File:** `src/catalogs/application/delete-catalog-item.use-case.ts:23-30`.
- **Wrong result:** `isInUse` = false, a patient is created with that avatar before `delete()` runs → FK violation → 500; the image is not removed and the item stays. Conversely, an avatar deleted between `catalogs.find('avatars')` and `patients.save` in `create-patient.use-case.ts:31-38` gives a 500 after the patient number was already consumed.
- **Fix:** catch `P2003` and fall back to deactivation; for patients, map `P2003` to `UnknownCatalogValue`.

### L12. Second concurrent payment stacks on a stale period
- **File:** `src/subscriptions/application/record-payment.use-case.ts:25-37`, `subscription.entity.ts:96-105`.
- **Wrong result:** two `POST /platform/institutions/:id/payments` in flight at once both read `currentPeriodEnd = E`, both compute `E + 1 year`; two payments are stored but the plan is extended by one year, not two.
- **Fix:** `SELECT … FOR UPDATE` the Subscription row inside `savePayment`'s transaction and recompute the period there.

### L13. `homework.complete` is not idempotent under concurrency; `completedBy` is last-writer-wins
- **File:** `src/family/application/family.use-cases.ts:80-90`, `homework.prisma.repository.ts:100-108`.
- **Wrong result:** two guardians of the same child tap "done" at the same time: both pass `complete()` (both read `completedAt = null`), both `save`, both audit `HOMEWORK_COMPLETE`; the row ends with the later guardian's id and time.
- **Fix:** `updateMany({ where: { id, completedAt: null }, data: … })` and treat `count === 0` as already done.

---

## Checked and found correct (no finding)

- **tenancy / prisma pool**: `SET ROLE` + `set_config` per connection, owner pool for `asSystem`, `enterInstitution` only mutates the ALS store; interactive transactions hold one scoped connection. RLS policies in 20261027/20261029/20261102 match the tables' `institutionId` columns; `Notification` inserts and `Subscription*` writes correctly go through `asSystem` (necon_app has no INSERT grant).
- **sync.save**: `createMany … skipDuplicates` on tablet UUIDs; `endedAt` back-fill via `updateMany(endedAt: null)`; FK order (sessions → events → runs → results) inside one `$transaction`; `lastSyncAt` update. `refreshUsage` recomputes (not increments), buckets days with `- interval '5 hours'`, and bumps `GlobalSyncVersion` with a row lock. Discharge rule `startedAt >= dischargedAt` → reject. `pinVerifiedBefore` window (−12 h, +60 s). WS: errors are caught in `run()` (no unhandled rejection), `BatchTooLarge` → 413 on HTTP.
- **profiles**: `edit()` only touches `editable` keys; `orderCategories/orderPictograms` verify the exact id set; `setPictogramHidden` is idempotent and does not bump the version when unchanged; `touch()` is called on discharge/reactivate and avatar change; clips are matched on `text = label`.
- **patients**: `nextCode()` is a single `INSERT … ON CONFLICT DO UPDATE … RETURNING` (row-locked, never reused); `birthDate/consentDate` round-trip as `@db.Date` without zone shift; `MaxDate` guards; consent image validated by bytes and stored AES-256-GCM.
- **appointments**: overlap check is backed by the GiST exclusion constraints (`therapist/patient/room`, `WHERE status='SCHEDULED'`), and `rethrowOverlap` maps them to 409; `update()` is guarded by `status = 'SCHEDULED'` so closing twice → 409; hours check uses `centerWeekday/centerMinuteOfDay` (UTC-5); `FutureAppointmentsCanceller` on discharge.
- **treatments**: progress figures computed per page; `nextAppointment` via `distinct` + ordered query; 30-day minutes filter.
- **homework / notes / family**: `checkPictograms` 1–12 unique; `change()` keeps `null` (clears due date) and drops `undefined`; `assertOpen()` before edit/delete; 24 h author-only edit; `share()` by any assigned therapist; guardians restricted by `GuardianPatient` on every path (events for foreign sessions are rejected; see M2 for the one gap).
- **jobs**: `claimNext` is one `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)`; lease renewal; expired-lease takeover; business errors fail once, transient errors retry with backoff to `maxAttempts`; `complete()` returns false if the job vanished and the file is removed; results expire and are cleaned; `downloadUrl` only when DONE and for the requester; `ip` never returned.
- **subscriptions**: `effectiveStatusOf`, `addYear` (UTC), fixed-amount check, cancel/reactivate transitions, `savePayment` in one transaction (apart from L12).
- **limits**: `QuotaPrismaReader` reads the institution row under RLS; `null` = unlimited (apart from L3).
- **voices**: register runs once per PENDING voice; clips loop terminates (`failed` set), re-generates on label change, removes replaced files, rolls back the file if `saveClip` fails, and touches profiles in `finally`; `delete()` resets `voice: CLONED → SYSTEM` and touches the profile.
- **vocabulary / categories / catalogs / center / notifications**: paging shape `items,page,limit,total,totalPages` everywhere via `toPage`; `limit` capped at 100 by `PaginationQuery`; room name uniqueness via `P2002 → 409`; `replaceHours` in one transaction; `CenterHours` check constraints match the DTO ranges; notifications scoped by `(audience, institutionId)` incl. the `NULL` platform case.
- **dashboard**: overview day/week boundaries built from Ecuador local midnight; `minutesOpen` and week labels in UTC-5; `resolvePeriod` caps at 366 days; `previousFrom` symmetric; anonymous patient excluded; admin-only devices block.
- **/devices/settings**: returns exactly `{ centerName, centerPin, therapistTimeoutMinutes }`.
- **Migrations vs schema**: every column, enum value, index, FK and default in `schema.prisma` for the models touched since 20261027 (Institution, InstitutionRequest, Notification, Appointment incl. `roomId`, Room, CenterHours, TreatmentPlan, Subscription, SubscriptionPayment, User.specialty, CenterSettings.logoPath, Session index) has a matching statement in the migrations. Extra DB-only constraints (CHECKs, exclusion constraints) are intentionally outside Prisma.
- **Tests**: scanned all 26 e2e spec files (214 `it` blocks) for bodies without `expect(`/`.expect(`/`toThrow`/`rejects`; none found. No `it.skip`/`xit`/`it.todo`.

## Modules read in full
sync, sessions, appointments, patients, profiles, treatments, homework, notes, family, jobs, subscriptions, limits,
voices, vocabulary, pictograms, categories, catalogs, center, notifications, dashboard, common, tenancy, prisma,
devices (controller, device-auth, register/registration-code), auth (decorators, guard, audit log), settings (views),
prisma/schema.prisma, migrations 20261027000000 … 20261103000000.
