# Audit: pagination, database access and load time (Necon API + web)

Read-only. Nothing was edited, no `.env` or `.local-dev/local.env` was opened, nothing was rebuilt. Date: 2026-11-03.
Backend: `<local path>` (paths below are relative to `src/` unless they start with `prisma/`).
Web: `<local path>`.

**No time in this report was measured by me.** Where I cite a number it is either a size read from `.next` (bundle) or a figure the team itself measured and wrote in `test/perf/RESULTADOS.md` / `PERFORMANCE.md` (labelled "team-measured"). Everything else is a statement about how many rows, queries or requests a path touches, which is what grows with the data. "Expected time saved" is a ranking by growth class, not milliseconds.

Assumed target size: 100 centers, 5,000 patients (about 50 per center on average, a few much larger), 2,000,000 events. Sessions are not given; the team's own test used 500,000 sessions (`PERFORMANCE.md`), so I use the same order of magnitude.

---

## 0. Counts

| Item | Count |
|---|---|
| GET routes (`@Get(` in `*.controller.ts`) | 65 |
| GET routes that return a paginated list (`items,page,limit,total,totalPages`) | 34 (table 1) |
| Pagination default / maximum (one place: `common/pagination/pagination.dto.ts:13-21`) | 20 / 100, every list route extends or uses `PaginationQuery` |
| Paginated routes that run a `count` on every call, including page 2, 3 ... | 34 of 34 (page + total in `Promise.all`; `dashboard/patients` runs a heavier raw tally) |
| Paginated routes with an unstable order (no unique tie-breaker) | 5 (sessions list x2, jobs, notes, goals) |
| Collections returned without pagination that can grow | 9 (table 2) |
| `findMany` calls in `src` (excluding scripts/specs) | 83 |
| `findMany` without `take` that can grow with data | 10 (table 2) |
| `$queryRaw` calls | 36; none returns unbounded rows, but 6 scan unbounded input (see section 3/4) |
| Web routes (`page.tsx`) | 30 |
| Web `refetchInterval` timers | 6 (appointments 60 s, overview 60 s, unread 60 s, treatment-progress 60 s, live patients 15 s, board 30 min) plus job polling 2.5 s while a job is active |
| Web places that fetch every page in a loop | 1 (`appointmentsApi.listRange`, capped at 6 pages = 600 rows) |
| Client components | 145 of 244 `.tsx` files declare `'use client'`; every `page.tsx` renders a client screen |

Important structural fact for index design: **every table with an `institutionId` column has row level security `"institutionId" = current_institution()`** (`prisma/migrations/20261027000000_institutions/migration.sql:~288-300`, function is `STABLE`, so it is index-friendly). That predicate is appended to every query. A list query that has no parent id in its WHERE (all patients of a center, all audit rows of a center, all pictograms of a center) can only be served from an index that starts with `institutionId`. Indexes that do not start with `institutionId` (for example `AuditLog_createdAt_idx`, `Pictogram_label_idx`, `Profile_syncVersion_idx`, `Patient_status_idx`) are shared by all 100 centers and are filtered row by row after the scan.

---

## 1. Every GET route that returns a list

Legend: Count = a `count()` runs on every call. Stable = the ORDER BY ends in a unique column.

| # | Route | Controller:line | Query:line | Paginated | Default / max | Count every call | Stable order |
|---|---|---|---|---|---|---|---|
| 1 | GET /appointments | appointments.controller.ts:29 | appointments.prisma.repository.ts:56,63 | yes | 20 / 100 | yes | yes (startsAt, id) |
| 2 | GET /audit | audit.controller.ts:24 | audit.prisma.repository.ts:31,32 | yes | 20 / 100 | yes, over the whole filtered audit of the center | yes (id desc) |
| 3 | GET /catalogs/:kind | catalogs.controller.ts:31 | catalogs.prisma.repository.ts:33,34 | yes | 20 / 100 | yes | yes (name, id) |
| 4 | GET /categories | categories.controller.ts:35 | categories.prisma.repository.ts:17,23 (+ `_count` subquery per category) | yes | 20 / 100 | yes | yes (sortOrder, name; name is unique per center) |
| 5 | GET /categories/:id/pictograms | categories.controller.ts:56 | categories.prisma.repository.ts:49,56 (`include pictogram` = all columns) | yes | 20 / 100 | yes | yes |
| 6 | GET /rooms (center) | center.controller.ts:27 | center.prisma.repository.ts:21,22 | yes | 20 / 100 | yes | yes (name unique per center) |
| 7 | GET /dashboard/patients | dashboard.controller.ts:39 | dashboard.prisma.read-model.ts:307-331 (raw, LIMIT at :325) | yes | 20 / 100 | yes, plus a second full pass (`tally`, :326) | yes (sort + code) |
| 8 | GET /data-requests | data-requests.controller.ts:42 | data-requests.prisma.repository.ts:40,41 (and :34 unbounded) | yes | 20 / 100 | yes | yes |
| 9 | GET /devices | devices.controller.ts:64 | devices.prisma.repository.ts:83,89 | yes | 20 / 100 | yes | yes |
| 10 | GET /family/patients | family.controller.ts:21 | family.prisma.read.ts:21,22 | yes | 20 / 100 | yes | yes (code) |
| 11 | GET /family/patients/:id/sessions | family.controller.ts:42 | sessions.prisma.read-model.ts:38,39 | yes | 20 / 100 | yes | **no** (`ORDER BY s."startedAt" DESC`, line 22) |
| 12 | GET /family/patients/:id/notes | family.controller.ts:49 | family.prisma.read.ts:55,62 | yes | 20 / 100 | yes | yes |
| 13 | GET /family/patients/:id/homework | family.controller.ts:56 | homework.prisma.repository.ts:62,69 | yes | 20 / 100 | yes | yes |
| 14 | GET /patients/:patientId/homework | homework.controller.ts:17 | homework.prisma.repository.ts:62,69 | yes | 20 / 100 | yes | yes |
| 15 | GET /platform/requests | institutions.controller.ts:60 | institutions.prisma.repository.ts:45,51 | yes | 20 / 100 | yes | yes |
| 16 | GET /platform/institutions | institutions.controller.ts:99 | institutions.prisma.repository.ts:155,156 | yes | 20 / 100 | yes | yes |
| 17 | GET /jobs | jobs.controller.ts:35 | jobs.prisma.repository.ts:41,42 | yes | 20 / 100 | yes | **no** (`createdAt desc` only) |
| 18 | GET /patients/:patientId/notes | notes.controller.ts:18 | notes.prisma.repository.ts:16,23 | yes | 20 / 100 | yes | **no** (`createdAt asc` only) |
| 19 | GET /patients/:patientId/goals | notes.controller.ts:51 | notes.prisma.repository.ts:50,57 | yes | 20 / 100 | yes | **no** (`createdAt desc` only) |
| 20 | GET /notifications | notifications.controller.ts:24 | notifications.prisma.repository.ts:25,26 | yes | 20 / 100 | yes | yes |
| 21 | GET /patients | patients.controller.ts:47 | patients.prisma.repository.ts:57,58 | yes | 20 / 100 | yes | yes (code) |
| 22 | GET /pictograms | pictograms.controller.ts:29 | pictograms.prisma.repository.ts:38,39 | yes | 20 / 100 | yes | yes |
| 23 | GET /pictograms/arasaac | pictograms.controller.ts:36 | search-arasaac.use-case.ts:21 (in-memory slice of a 24 h cached external result; DB fallback :38) | yes (in memory) | 20 / 100 | total = cached array length | n/a |
| 24 | GET /patients/:patientId/sessions | sessions.controller.ts:24 | sessions.prisma.read-model.ts:38,39 | yes | 20 / 100 | yes | **no** (same `startedAt DESC`) |
| 25 | GET /platform/payments | subscriptions.controller.ts:30 | subscriptions.prisma.repository.ts:65-71 | yes | 20 / 100 | yes | yes |
| 26 | GET /platform/institutions/:id/payments | subscriptions.controller.ts:48 | subscriptions.prisma.repository.ts:47,48 | yes | 20 / 100 | yes | yes |
| 27 | GET /subscription/payments | subscriptions.controller.ts:89 | subscriptions.prisma.repository.ts:56,57 | yes | 20 / 100 | yes | yes |
| 28 | GET /live/patients | live.controller.ts:14 | live.prisma.read.ts:39,46 (+ open sessions raw :19-27) | yes | 20 / 100 | yes | yes (code) |
| 29 | GET /sync/profiles (tablet) | sync.controller.ts:21 | profiles.prisma.repository.ts:224,231 | yes | 20 / 100 | yes | yes (syncVersion, id) |
| 30 | GET /treatment-progress | treatments.controller.ts:22 | treatments.prisma.repository.ts:59,75 | yes | 20 / 100 | yes | yes (code) |
| 31 | GET /therapists (tablet) | therapists.controller.ts:22 | users.prisma.repository.ts:23,24 | yes | 20 / 100 | yes | yes (name, id) |
| 32 | GET /users | users.controller.ts:47 | users.prisma.repository.ts:23,24 | yes | 20 / 100 | yes | yes |
| 33 | GET /users/:id/patients | users.controller.ts:89 | users.prisma.repository.ts:40,41 | yes | 20 / 100 | yes | yes (code) |
| 34 | GET /vocabulary (tablet) | vocabulary.controller.ts:14 | vocabulary.prisma.repository.ts:17,31 | yes (categories) | 20 / 100 | yes | yes (sortOrder, name) |

The tablet contract is unchanged in every proposal below: the proposals never rename or remove `items,page,limit,total,totalPages` and never lower the 100 maximum.

---

## 2. Collections that are NOT paginated and can grow (flag list)

| # | Where | What grows | Bounded by |
|---|---|---|---|
| U1 | GET /patients/:id/profile, `profiles.controller.ts:26` -> `profiles.prisma.repository.ts:105-106` (`include: board`, defined :11-23); same board on `GET /family/patients/:id/profile` (`family.controller.ts:35`) and in every `GET /sync/profiles` item | all categories x all pictograms of one patient, plus `voice.clips` (every clip, loaded even when the voice is not CLONED, :15) and `include: { pictogram: true }` (all columns) | the patient's own board (tens to low hundreds of pictograms; team measured 820 signed URLs per 20 profiles) |
| U2 | GET /sessions/:id, `sessions.controller.ts:31` -> `sessions.prisma.read-model.ts:52-53` | every event and every activity result of the session | events per session (grows with usage; no `take`) |
| U3 | `live.prisma.read.ts:67-72` (`sessionLog`) | every event + result of an open session (WebSocket live view) | same |
| U4 | GET /platform/dashboard, `institutions.controller.ts:54` -> `institutions.prisma.repository.ts:236-244` | `centers[]` for ALL institutions in one response (web slices it in the browser: `center-activity-list.tsx:12,26`) | number of institutions (100 now, grows) |
| U5 | GET /dashboard (overview), `dashboard.prisma.read-model.ts:111-115` (`therapists`, no `take`), :193 (rooms, no `take`) | all active therapists, all rooms | plan limits (`maxTherapists`) |
| U6 | GET /sync/profiles, `profiles.prisma.repository.ts:237-243` (`dischargedCodesSince`) and :245 (`retiredCodesSince`) | arrays of codes, repeated in the body of every page of the paged response | with `since=0` they hold every discharged and every erased patient of the center |
| U7 | `data-requests.prisma.repository.ts:34` | every code of every patient assigned to the therapist, then `patientCode IN (...)` | caseload of one therapist |
| U8 | `users.prisma.repository.ts:47` (`findAssignedPatients`, used by `replace-assigned-patients.use-case.ts:26`) | all assigned patients | caseload |
| U9 | `GET /audit/csv|xlsx|pdf`, `audit.controller.ts:31,41,51` -> `audit.prisma.repository.ts:43` | export, capped at 50,000 rows (`export-audit.use-case.ts:10`), loaded fully in memory | cap exists (bounded) |

Other `findMany` without `take` that are safe: `centerHours` (<= 7 rows; appointments.prisma.repository.ts:104, center.prisma.repository.ts:47), IN-lists bounded by one batch of 100 (`sync.prisma.repository.ts:21-57`) or one page, `institutions.prisma.repository.ts:81,142,181,204,205` (per-center admin lists; :204-205 load every user and device of a center on suspend, then delete cache keys one by one at :211-215), `voices.prisma.repository.ts:51`, `patient-records.prisma.ts:44` (full export job, by design, runs in the worker).

Raw queries without `LIMIT`: all of them aggregate (`GROUP BY` week/day/hour/therapist/room) so their output is small, but their input is not (section 3 and 4). `dashboard.prisma.read-model.ts:441` has `LIMIT 100` on devices: it silently truncates a center with more than 100 active tablets.

---

## 3. Database access findings (N+1, signed URLs, sequential awaits, includes, aggregates)

### 3.1 N+1
No read path runs one query per row. Every list loads its relations in batched `IN` queries or one raw query. Real loops:
- Write path, `sync.prisma.repository.ts:70`: one `updateMany` per ended session inside the batch transaction (up to 100 sequential statements, one round trip each). One `UPDATE ... FROM (VALUES ...)` would be one.
- Write path, `profiles.prisma.repository.ts:77-100` (`createFromTemplate`): `await tx.profileCategory.create` inside a `for` loop, once per category, when a patient is created.
- `institutions.prisma.repository.ts:211-215`: one cache delete per user and per device when a center is suspended.
- `patients.prisma.repository.ts:57` with `patientInclude` (patients.prisma.mapper.ts:5-9) is 4-5 round trips per page (patients, conditions, avatar, therapists, users). Prisma 7 may already use joins; I did not verify the strategy, so this is a note, not a claim.

### 3.2 Signed URLs
`storage.signedUrl` is a local HMAC (`@aws-sdk/s3-request-presigner`), not a network call, with an in-process cache that reuses each URL for half its lifetime (`common/storage/s3-file-storage.ts:11-45`). The team measured ~0.3 ms per signature (their comment, line 13) and added the cache. Rows that still sign per row: patients list (`patient-view.ts:9`), dashboard patients (`list-patient-usage.use-case.ts:32`), live patients (`list-live-patients.use-case.ts:23`), family, catalogs, homework, vocabulary, board (`profile-view.ts:13-45`: avatar + image + audio per pictogram). With the cache they are cheap after the first hit; the cost is the first request of every URL after the half-life (every 30 min) and per-process memory (20,000 entries cap, ~12 MB). One side effect: the URL changes every 30-60 minutes, so the browser HTTP cache for avatars and pictograms cannot live longer than that. I could not check the bucket's `Cache-Control`.

### 3.3 Sequential awaits that could be parallel
- `sessions/application/sessions.use-cases.ts:25-37`: `isAssigned` -> `patientCode` -> audit `INSERT` -> then the read. Four round trips in series on `GET /patients/:id/sessions` and `/reports`; `get()` (:40-44) is worse: `read.find` (raw summary + `findUniqueOrThrow` + pictogram labels, 3 sequential at `sessions.prisma.read-model.ts:45-60`) then the three above. `isAssigned`, `patientCode` and the read are independent.
- `patients/application/get-patient.use-case.ts:19-31`: `find` -> `isAssigned` -> audit. `find` and `isAssigned` are independent.
- `family/application/family.use-cases.ts:46-67`: `allow()` then the read, same pattern.
- `profiles/application/get-profile.use-case.ts:17-24`: `isAssigned` then `findBoard`.
- `dashboard.prisma.read-model.ts:333-355`: after the page query, the three follow-ups run in parallel (good), but the page query and the `tally` already run in parallel too; fine.

### 3.4 `include`/`select` loading columns that are not used
- `patients.prisma.mapper.ts:5` loads `conditions` for every page of `GET /patients`, but `toPatientSummaryView` (`patient-view.ts:9`) returns no `conditionIds`. One query per page for nothing.
- Board (`profiles.prisma.repository.ts:11-23`): `voice.clips` always; `pictogram: true` (institutionId, createdAt, active, ...) when the view uses five fields.
- `devices.prisma.repository.ts:83-86` returns the whole `Device` row (token hash, public key) for the list.
- `categories.prisma.repository.ts:49-56` and `vocabulary.prisma.repository.ts:19-29` use `include pictogram` (all columns).
- `GET /patients/:id/reports` (`sessions.prisma.read-model.ts:97`) always runs a `SELECT count(*) FROM "Device"` that has nothing to do with the patient.

### 3.5 Heavy aggregates on every request
- `GET /dashboard` (`dashboard.prisma.read-model.ts:60-130`): **19 queries in parallel** (11 in the first `Promise.all`, 8 in `insights`). `PrismaService` has a pool of 20 (`prisma.service.ts:~60`). One home page view can occupy almost the whole pool, and `ScopedPool.connect` (:33-44) sends `SET ROLE ...; set_config(...)` whenever the connection last served another center (`sessionFor`, :15-19). With 100 centers the idle connection you get is usually from a different center, so most acquisitions pay one extra round trip to Neon. This applies to every query of every request, not only the dashboard, but fan-out multiplies it.
- `GET /dashboard/usage` (`appUsage`, :385-443): 8 queries; the home page asks for 56 days (`usage-highlights.tsx:14,21`). `communication` (:430-433) joins `Event` to `Session` and counts by `type`: it touches every event of every session in the period.
- `GET /dashboard/patients` (`patientUsage`, :266-331): `usage` (laterals over Appointment and Session for each active patient, plus two correlated subselects) is executed twice per request, once for the page and once for `tally`. `tally` always walks all active patients of the center; sorting by MINUTES, LAST_SESSION, NO_SHOWS or using a flag also forces the page query to compute all patients. Work is O(active patients x rows in period). `ILIKE '%x%'` on three columns (:299) cannot use a btree.
- `GET /dashboard/analytics`: 10 queries (:166-209), all bounded by the period (capped 366 days, `analytics-period.ts:4`), each served by `(institutionId, startedAt)` / `(institutionId, status, startsAt)`. Fine.
- `GET /platform/dashboard` (`platformStats`, `institutions.prisma.repository.ts:231-248`): runs as table owner without RLS and has `session.groupBy({ by: ['institutionId'], where: THERAPY, _max: { startedAt } })` at :240 and a 30-day `groupBy` at :239. Neither has an `institutionId` equality, so neither can use `Session(institutionId, startedAt)` as a range (a btree cannot skip its leading column; skip scan exists only from PostgreSQL 18, and I do not know the Neon version). `:240` has no time bound at all: it reads every THERAPY session of every center on every call.
- `GET /patients/:id/reports` (`sessions.prisma.read-model.ts:70-116`): three separate scans of the patient's events for the period (`distinctWords`, `topWords`, `sentences`), each reading `payload` JSON from the heap.
- `POST /sync/batch` -> `refreshUsage` (`sync.prisma.repository.ts:94-114`): recomputes counts from **all events of every patient in the batch**, on every batch. The team's own comment at :92 says so ("agrega sobre todos los eventos del paciente"). It then sets `Profile.syncVersion` for those patients (:111), which makes **every tablet of the center re-download those boards on its next `/sync/profiles`** (570 KB per 20 boards, team-measured, `RESULTADOS.md` finding 4).
- `GlobalSyncVersion` single row per center is updated inside every batch (`sync.prisma.repository.ts:104-108`, also profile edits), serialising batches of one center (team finding 8, still open).
- Audited reads: `GET /patients/:id`, `/patients/:id/sessions`, `/reports`, `/sessions/:id`, `family/...` insert one `AuditLog` row each, awaited inside the request (`get-patient.use-case.ts:22`, `sessions.use-cases.ts:30`).

---

## 4. Index support (schema.prisma + migrations) and proposed indexes

Existing indexes are listed in `prisma/schema.prisma` (grep `@@index`). Verdict per query that grows.

| Query (file:line) | WHERE / ORDER BY | Existing index | Verdict |
|---|---|---|---|
| Patients list (`patients.prisma.repository.ts:57`) | RLS inst., `code <> 'ANON'`, `status?`, search ILIKE, ORDER BY code | `unique(institutionId, code)` | order + RLS ok; `status` is a filter; `Patient_status_idx(status)` is global and useless under RLS; ILIKE has no trigram |
| `treatment-progress`, `live/patients`, `users/:id/patients`, `family/patients` | same, plus `therapists.some` | PK `TherapistPatient(therapistId, patientId)`, `(patientId)` | ok |
| Appointments (`appointments.prisma.repository.ts:56`) | inst. + `startsAt` range, `therapistId`, `patientId`, `roomId`, `status`, `therapist.specialty`; ORDER BY startsAt,id | `(institutionId,startsAt)`, `(therapistId,startsAt)`, `(patientId,startsAt)`, `(roomId,startsAt)`, `(institutionId,status,startsAt)`, `User(institutionId,specialty)` | **ok, no new index** |
| Audit list/count (`audit.prisma.repository.ts:31,32,43`) | inst., optional `actorId`, `action`, `patientCode`, `createdAt` range; ORDER BY **id** desc | `(institutionId,createdAt)`, `(createdAt)`, `(patientCode)`, `(actorId)` | **missing**: ORDER BY id has no index with `institutionId` first; planner must walk the global PK backwards filtering other centers, or sort the center's rows. `actorId`/`patientCode` indexes are global. `count` scans all of the center's matching rows each call |
| `pinVerifiedBefore` (`sync.prisma.repository.ts:33`) | `action, actorId, entityId, createdAt` range | `(actorId)` | acceptable today, composite below makes it exact |
| Pictograms search (`pictograms.prisma.repository.ts:38`) | inst., `label ILIKE '%q%'`, ORDER BY label,id | `(label)` global | **missing**: no `institutionId` prefix; `contains` needs trigram |
| Sessions by patient (`sessions.prisma.read-model.ts:38`) | `patientId`, `startedAt` range, ORDER BY startedAt | `(patientId,startedAt)` | ok (add `id` tie-breaker to the ORDER BY) |
| Sessions per center in period (dashboard) | inst., `startedAt`, `kind` | `(institutionId,startedAt)` | ok (team-measured: 63-97 ms -> 2-3 ms with 500,000 sessions) |
| **Homework practice** (`homework.prisma.repository.ts:44-50`) | `Session.homeworkId IN (page ids)` | none | **missing** (full scan of the center's sessions per homework page; also the FK `onDelete: SetNull`) |
| **Open sessions of a tablet** (`live.prisma.read.ts:~68`, `openOnDevice`) and device usage join (`dashboard.prisma.read-model.ts:440`) | `Session.deviceId = ?` (`endedAt IS NULL`) | none | **missing** (also FK `onDelete: Restrict`) |
| Events by session (`sessions.prisma.read-model.ts:12-15`, `52`, `live.prisma.read.ts:67`) | `sessionId`, `type`, ORDER BY occurredAt | `(sessionId,occurredAt)`, `(type)` | order ok; `type` filter goes to the heap; `(type)` alone is never used by any query I found |
| appUsage `communication` (`dashboard.prisma.read-model.ts:430-433`) | Event JOIN Session in period, count by `type` | same | works but touches every event of the period |
| `refreshUsage` (`sync.prisma.repository.ts:94-114`) | events of the patient's sessions, `type`, payload | `(sessionId,occurredAt)` | per team-measured note: index is used (72 -> 7.4 ms at 377,000 events), but cost is linear in the patient's events |
| Tablet sync (`profiles.prisma.repository.ts:221-231`, :237-247) | `syncVersion > since` + `patient.status`; ORDER BY syncVersion,id | `Profile(syncVersion)`, `RetiredPatientCode(syncVersion)` | **mis-keyed**: `syncVersion` is a per-center counter (`GlobalSyncVersion` per institution), so a range on the global index returns rows of other centers that RLS then removes |
| Notifications (`notifications.prisma.repository.ts:25,32`) | audience, inst., `readAt IS NULL`, ORDER BY createdAt,id | `(audience,institutionId,createdAt)` | ok (unread is a filter; fine at inbox sizes) |
| Data requests (`data-requests.prisma.repository.ts:40`) | inst., `status`, `type`, `patientCode IN`, ORDER BY requestedAt,id | `(institutionId,status)`, `(patientCode)`, `(status)` | ok for the expected volume (tens per center) |
| Users list (`users.prisma.repository.ts:23`) | inst., `role`, `active`, ORDER BY name,id | `unique(institutionId,email)`, `(institutionId,specialty)` | works (tens of rows per center); `(institutionId, role, active)` would be cleaner but is low priority |
| Devices, rooms, categories | inst. only, small | `(institutionId)`, uniques | ok |
| Platform stats (`institutions.prisma.repository.ts:239-240`) | `kind`, `startedAt`, group by `institutionId` | `(institutionId,startedAt)` | cannot be used as a range (see 3.5): rewrite, not just index |
| Job cleanup (`jobs.prisma.repository.ts:98`) | `resultPath IS NOT NULL AND expiresAt < now` | `(status,runAfter)` ... | no index on `expiresAt`; small table, low priority |

### Proposed indexes (exact)

Prisma schema (`prisma/schema.prisma`), each as a new migration:

```prisma
model Session {
  // new
  @@index([homeworkId])
  @@index([deviceId, startedAt])
}

model Event {
  // replace @@index([type]) with:
  @@index([sessionId, type])
}

model Profile {
  // replace @@index([syncVersion]) with:
  @@index([institutionId, syncVersion, id])
}

model RetiredPatientCode {
  // replace @@index([syncVersion]) with:
  @@index([institutionId, syncVersion])
}

model AuditLog {
  // replace @@index([createdAt]), @@index([patientCode]), @@index([actorId]) and
  // @@index([institutionId, createdAt]) with:
  @@index([institutionId, createdAt(sort: Desc), id(sort: Desc)])
  @@index([institutionId, actorId, createdAt(sort: Desc), id(sort: Desc)])
  @@index([institutionId, patientCode, createdAt(sort: Desc), id(sort: Desc)])
}

model Pictogram {
  // replace @@index([label]) with:
  @@index([institutionId, label, id])
}

model Patient {
  // replace @@index([status]) with:
  @@index([institutionId, status, code])
}
```

Raw SQL in the same migrations (Prisma cannot declare these):

```sql
-- contains/ILIKE search of the pictogram catalog
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Pictogram_label_trgm_idx" ON "Pictogram" USING gin ("label" gin_trgm_ops);

-- optional, smaller than the full Session.homeworkId index and as useful:
-- CREATE INDEX "Session_homeworkId_idx" ON "Session"("homeworkId") WHERE "homeworkId" IS NOT NULL;
```

Notes on each:
- `AuditLog`: the audit query must change `orderBy: { id: 'desc' }` to `[{ createdAt: 'desc' }, { id: 'desc' }]` (`audit.prisma.repository.ts:31,43`) so the order matches the index. The web shows the same newest-first order (id is monotonic with createdAt); only a clock skew could reorder rows. `pinVerifiedBefore` (`actorId` + `createdAt` range) is then served by the second index.
- `Event`: `(sessionId, type)` replaces `(type)`, so insert cost stays the same on a 2,000,000-row table. Do not keep both `(type)` and the new one. If a later plan adds session counters (section 5, W2), this index is still needed for the per-session timeline filters.
- `Profile(institutionId, syncVersion, id)` matches `ORDER BY syncVersion, id` for `/sync/profiles` and its `count`.
- Not proposed: new Appointment indexes (already complete), `Session(therapistId)` / `guardianId` (no query filters by them), trigram on Patient (a center has tens to a few thousand patients; the `(institutionId, code)` index already bounds the scan).
- Platform stats needs a query rewrite as well (see W1). Optional supporting index if the rewrite is done with per-center probes: `Session(institutionId, kind, startedAt)`; this also lets `kind = 'THERAPY'` filters in `dashboard.prisma.read-model.ts:80,119,128` be index-only. It is a write-cost tradeoff on `Session`, which is far smaller than `Event`.

---

## 5. Ranked findings (expected time saved at 100 centers / 5,000 patients / 2,000,000 events)

Ranking is by how the work grows, and by how often the path runs. Not measured.

### W1. Platform dashboard reads every session of every center, and four screens call it
- `institutions.prisma.repository.ts:239` and `:240` are `groupBy institutionId` over `Session` with no way to use the per-center index; `:240` has no time bound. Work grows with total sessions in the database (hundreds of thousands), not with 100 centers.
- Four screens trigger it: `platform-home-screen.tsx:22`, `institutions-screen.tsx:29` (only to look up `planStatus`), `requests-screen.tsx:44` (only for two counters), `payments-screen.tsx:22` (only for a total). `usePlatformDashboard` (`use-institutions.ts:15`) has the default 30 s `staleTime` and `refetchOnWindowFocus`.
- Fix: (a) rewrite `:239-240` as one probe per institution (`JOIN LATERAL ... WHERE "institutionId" = i.id AND kind = 'THERAPY' ORDER BY "startedAt" DESC LIMIT 1` and a 30-day `count(*)`), or keep a `lastSessionAt` column per institution updated in `sync.prisma.repository.ts:save`; (b) cache the result 60 s with the existing `cache.wrap` (`auth.prisma.repository.ts:41` uses it); (c) put `planStatus` in `GET /platform/institutions` and the pending counts in a cheap endpoint so three screens stop calling the heavy one; (d) paginate or cap `centers[]` (`center-activity-list.tsx` already paginates in the client).

### W2. Aggregates that read events instead of counters
- Paths: `dashboard.prisma.read-model.ts:430-433` (home loads 56 days of it, `usage-highlights.tsx:14,21`), `sessions.prisma.read-model.ts:12-15` (four correlated subselects per listed session, every page of the sessions tab), `:77-95` (three event scans per report), `sync.prisma.repository.ts:94-114` (all events of the patients of each tablet batch, then every tablet re-downloads the boards).
- All of them scale with the 2,000,000-event table. `(sessionId, type)` helps the lookups; counters remove them.
- Fix: add `tapCount` and `sentenceCount` (and `activityCorrect`/`activityTotal`) to `Session`, filled when the batch is saved (`sync.prisma.repository.ts:66-80`). Then `communication` is a `sum()` over sessions already in `(institutionId, startedAt)`, the sessions tab loses its four subselects, and `refreshUsage` can add the batch's own taps instead of recounting history (the team's own `ponytail` note at :92 proposes exactly this). Also stop bumping `Profile.syncVersion` for usage counters alone; tablets pay the 570 KB download for a number the board does not need to show.

### W3. Missing or mis-keyed indexes (section 4)
`Session(homeworkId)`, `Session(deviceId, startedAt)`, `Profile(institutionId, syncVersion, id)`, `RetiredPatientCode(institutionId, syncVersion)`, the three `AuditLog` composites, `Pictogram(institutionId, label, id)` + trigram, `Patient(institutionId, status, code)`, `Event(sessionId, type)`. The first two turn per-page full scans into index probes, the sync one is on the route every tablet calls, the audit one removes a sort/scan that grows with the busiest table in the app.

### W4. Dashboard fan-out and per-connection `SET ROLE`
- `centerOverview` issues 19 queries at once (`dashboard.prisma.read-model.ts:63-83,109-130`); `analytics` 10; `appUsage` 8. The API pool is 20 (`prisma.service.ts`), so one home page can use nearly all connections and a second admin waits. Each acquisition by a different center pays one `SET ROLE; set_config` round trip (`prisma.service.ts:15-19,33-44`).
- Fix: merge the counts into 3-4 SQL statements with `FILTER` (users by role/active, patients by status, devices by revoked/stale, appointments by status/window are all `count(*) FILTER`), cache the overview for 30-60 s per center in Redis, and lazy-load `UsageHighlights` only when it scrolls into view. Consider a smaller per-request parallelism limit.

### W5. Web request volume: polling, duplicates, lookups that fetch lists
- Shell on every center/therapist screen (`center-layout.tsx:34-37`, `therapist-layout.tsx:30-33`): `useUpcomingTherapies` -> `useAppointments` with `refetchInterval: 60_000` (`use-appointments.ts:14`) -> `listRange` (`appointments.api.ts:14-18`) = up to 6 parallel pages of 100 rows every 60 s to find the next appointment. Needs `?status=SCHEDULED&from=now&limit=1`.
- Home/schedule add a second and third appointments query for the week (`day-rail.tsx:26`, `schedule-board.tsx:89`), with a different key from the shell's "today", so the same rows are downloaded twice and polled twice.
- `use-patients.ts:44-55`: every open patient record polls `GET /live/patients?limit=100` every 15 s (100 rows, 100 signed URLs, a count and an open-session raw query) to find one patient. The API already has a WebSocket for exactly this (`live.gateway.ts:30-35`); the web does not use it. A `GET /live/patients/:id` would do.
- `useTreatmentProgress` is used as a single-patient lookup (`treatment-card.tsx:13`, `appointment-sheet.tsx:30`) and polls every 60 s (`use-treatments.ts:15`) on lists (`center-patients-screen.tsx:29`, `my-patients-screen.tsx:18`, `therapist-home-screen.tsx:23`).
- `refetchOnWindowFocus: true` with `staleTime: 30_000` for everything (`query-provider.tsx:14-15`) means each return to the tab after 30 s re-runs audited GETs (patient record, sessions, reports), which write an `AuditLog` row each.
- Command palette query is not debounced (`command-palette.tsx:50-54`): one `treatment-progress` request (count + 3 queries + ILIKE) per keystroke from the second character.

### Further findings (smaller, ordered by impact)
6. Auth waterfall: the shell is a prerendered static page; JS (about 145 KB gzip for the center layout, read from `.next/app-build-manifest.json`) -> `POST /auth/refresh` (`session-context.tsx:38-41`, `require-role.tsx`) -> data. Starting the refresh from an inline script in the document would overlap it with the JS download.
7. Browser calls go browser -> nginx -> Next -> rewrite -> API (`next.config.ts:12-14`, `deploy/nginx.conf:145`). Routing `/api/` straight to `necon_api` in nginx removes the Node hop on every request. API responses are gzip'd by nginx (`nginx.conf:36-41`); the API itself has no compression middleware.
8. `count` on every page of every list. Cheap on small tables, linear on `GET /audit` (all audit rows of the center for the filter) and on `dashboard/patients` (full usage pass). Contract stays; options: cache the total per filter for 30-60 s, or compute it only for page 1.
9. Unused includes (section 3.4): patients list `conditions`, board `voice.clips`, full `Pictogram` rows.
10. Sequential awaits (section 3.3): sessions use-cases, get-patient, family, get-profile: 1-3 round trips each.
11. `appointmentsApi.listRange` silently truncates at 600 rows (`appointments.api.ts:7,17`); a busy week hides appointments with no message (correctness).
12. Data-loss risk: `assign-patients-section.tsx:33,47` seeds the selection from the first 100 assigned patients and saves with `PUT /users/:id/patients` (replace); `replaceAssignedPatients` deletes the rest. A therapist with more than 100 assigned patients loses the extra ones on save. The picker (`patients.api.ts:17`) also shows only 50 results with no paging.
13. Catalog avatars are fetched with `limit: 100` and map ids to URLs (`patients.api.ts:30`, `use-patients.ts:36-38`). A center with more than 100 avatars loses images in the patient tables. Also `users.list` 100 for therapists (`use-users.ts:17`), rooms 100 (`center.api.ts:8`).
14. Unstable order on five routes (`sessions.prisma.read-model.ts:22`, `jobs.prisma.repository.ts:41`, `notes.prisma.repository.ts:19,53`): add `id` as tie-breaker; with page-based paging, rows with equal timestamps can repeat or vanish between pages.
15. `GET /sync/profiles` repeats `dischargedPatientCodes` and `retiredPatientCodes` in every page (`get-sync-profiles.use-case.ts:25-34`). Needs a tablet check before changing; if the tablet reads them only from page 1, return them only there.
16. `OFFSET` pagination (`skipOf`, `common/pagination/page.ts:15`) is linear in the page number; fine at 100-item pages for these tables except `GET /audit`, where deep pages cost proportionally. Keyset paging would break the `page` contract, so keep OFFSET and rely on the audit index.

---

## 6. Web screens (30 routes) and what each requests on load

Shell requests that run on **every** route of a section (in addition to the screen's own):
- Center admin (`center-layout.tsx`): `GET /settings/branding` (staleTime 30 min), `GET /appointments?from=today&to=tomorrow&limit=100&page=N` (up to 6 pages, **poll 60 s**, staleTime 30 s; chip + reminders), `GET /notifications/unread-count` (**poll 60 s**).
- Therapist (`therapist-layout.tsx`): same three.
- Platform (`platform-layout.tsx`): unread count (poll 60 s) only.
- Public pages (login, forgot, reset, request-account) and `/change-password` also mount `QueryProvider`, `AuthProvider` and run `POST /auth/refresh` once (root layout).
- Defaults for every query: staleTime 30 s, `refetchOnWindowFocus` true, retry 2 on 5xx (`query-provider.tsx`).

| Route | Own requests on load | Page size | Pagination UI | Loop-fetch all pages | Refetch interval / staleTime | Flags |
|---|---|---|---|---|---|---|
| `/` | none (redirect after refresh) | - | - | no | - | |
| `/login`, `/forgot-password`, `/reset-password`, `/request-account`, `/change-password` | forms only (+ auth refresh) | - | - | no | - | three.js loads lazily on public pages (`logo-3d.tsx:25-27`) |
| `/center` (home) | `GET /dashboard`; `GET /dashboard/usage` (56 days, `usage-highlights.tsx:14,21`); week `GET /appointments` (`day-rail.tsx:26`) | 100 / page (week) | no | **yes**, up to 6 pages | overview 60 s poll, usage staleTime 60 s, week 60 s poll | 19 + 8 queries per load; second appointments query beside the shell's; three.js (lg+) in hero |
| `/center/appointments` | `GET /appointments` for the whole week (`schedule-board.tsx:82-89`), `GET /users?role=THERAPIST&limit=100`, `GET /rooms?limit=100`, `GET /center-hours` | 100 / page | no (agenda grid) | **yes**, up to 6 pages (silent cap 600) | appointments 60 s poll; therapists/rooms/hours 5 min | day/status filter done in the browser on the downloaded week (fine, intended); duplicates the shell's "today" query |
| `/center/patients` | `GET /treatment-progress` (page), `GET /users?role=THERAPIST&limit=100`, `GET /catalogs/avatars?limit=100` (signed URLs) | 20 | yes (server) | no | progress 60 s poll; avatars 30 min | list polled while open; avatars capped at 100 |
| `/center/team` | `GET /users`, `GET /limits` | 20 | yes | no | defaults (30 s) | |
| `/center/analytics` | by tab: summary -> `GET /dashboard/analytics`; patients -> `GET /dashboard/patients`; usage -> `GET /dashboard/usage`; always `GET /users?...limit=100` | 20 (patients) | yes (patients tab) | no | 60 s staleTime each | only the open tab fetches (good); patients tab does the 2x full pass (section 3.5) |
| `/center/devices` | `GET /devices`, `GET /limits` | 20 | yes | no | defaults | |
| `/center/data-requests`, `/therapist/data-requests` | `GET /data-requests` | 20 | yes | no | defaults | |
| `/center/audit` | `GET /audit` (when a filter is applied or on open), exports on demand | 20 | yes | no | defaults; record detail 5 min | `count` over all center audit rows each page |
| `/center/notifications`, `/platform/notifications` | `GET /notifications` (+ unread) | 20 | yes | no | defaults; unread 60 s | |
| `/center/settings`, `/therapist/settings` | `GET /settings`, `GET /subscription`, `GET /subscription/payments` (admin) | 10 (payments) | yes | no | 5 min | |
| `/therapist` (home) | `GET /treatment-progress?status=ACTIVE&limit=8`; today `GET /appointments` (same key as shell); week `GET /appointments`; `GET /dashboard/usage` | 8 / 100 | no | **yes** (appointments) | progress 60 s poll; appointments 60 s | two overlapping appointment queries (today + week); usage 56 days |
| `/therapist/patients` | `GET /treatment-progress`, avatars catalog | 20 | yes | no | progress 60 s poll | |
| `/therapist/patients/[id]` | `GET /patients/:id` (audited); then by tab. Summary: `GET /live/patients?limit=100` (**poll 15 s**), `GET /treatment-progress?search=code`, `GET /catalogs/diagnoses?limit=100`, `GET /catalogs/conditions?limit=100`, `GET /patients/:id/treatment-plan`. Sessions: `GET /patients/:id/sessions`. Progress: `GET /patients/:id/reports`. Notes: notes + goals. Board: `GET /patients/:id/profile` + catalog categories (20) + pictogram search. Export: jobs (10) | 20 / 10 / 20 | yes on lists | no | live 15 s; progress 60 s; board 10 min stale + 30 min refetch | refocus re-runs audited GETs; Progress and Board tabs are `next/dynamic` (good); live poll fetches 100 patients to find one |
| `/therapist/schedule` | same as `/center/appointments` | 100 / page | no | **yes** | 60 s poll | |
| `/therapist/analytics` | same tabs as center analytics, own scope | 20 | yes | no | 60 s | |
| `/platform` | `GET /platform/dashboard` | all centers in one response | client-side slice of 10 (`center-activity-list.tsx:26`) | no | defaults (30 s + focus) | full-table aggregates (W1) |
| `/platform/institutions` | `GET /platform/institutions` (20) **and** `GET /platform/dashboard` | 20 | yes | no | defaults | heavy endpoint called for `planStatus` only |
| `/platform/institutions/[id]` | `GET /platform/institutions/:id`, `.../subscription`, `.../payments` | 10 | yes (payments) | no | defaults | |
| `/platform/requests` | `GET /platform/requests` (20) **and** `GET /platform/dashboard` | 20 | yes | no | defaults | dashboard called for two counters |
| `/platform/requests/[id]` | `GET /platform/requests/:id` | - | - | no | defaults | |
| `/platform/payments` | `GET /platform/payments` (20) **and** `GET /platform/dashboard` | 20 | yes | no | defaults | dashboard called for one total |

Screens that download a whole collection and filter or paginate on the client:
1. Agenda (`schedule-board.tsx:82-97`): whole week filtered by day, status and view in the browser. Intentional (instant day switching) but it is capped at 600 rows and polled every minute.
2. Platform home: all centers sliced in the browser (`center-activity-list.tsx:26`).
3. Avatars: catalog limited to 100 and used as a lookup table for every patient table.
4. Assign patients: first 100 assigned patients used as the complete list (data-loss risk, finding 12).
5. Patient record summary: 100 live patients to read one.

Polling that could be less frequent or removed: shell appointments 60 s (use the next-appointment query and push on change), live 15 s (WebSocket exists), treatment-progress 60 s on lists (use focus + manual refresh; mutations already invalidate it), overview 60 s (30-60 s cache server side), unread count 60 s (fine, cheap; could stop when the tab is hidden: `refetchIntervalInBackground` is false by default).

Duplicated requests: appointments today (shell) vs week (home, schedule, week glance); `useTherapists` is shared by key (fine); `useLimits` on team and devices (same key, fine); `usePlatformDashboard` on four screens (same key but stale after 30 s so it refetches on each navigation).

---

## 7. Bundle (read from `caa-web/.next`, nothing rebuilt)

Sizes from `.next/app-build-manifest.json` (gzip computed from the chunk files):
- First-load JS gzip: `/layout` 123 KB; public pages 124-133 KB; `/platform/*` 131-138 KB; `/center/*` 131-157 KB (`/center` 156, `/center/analytics` 148, `/center/appointments` 147); `/therapist/*` 122-157 KB (`/therapist` 157, `/therapist/patients/[id]` 149). Matches `PERFORMANCE.md` (102 KB shared, `/center` 148 KB).
- Largest chunks (raw): `198f8915...js` 673 KB raw / 172 KB gzip = **three.js** (contains `WebGLRenderer`, not in any route manifest, so it is a dynamic chunk); framework 214 KB; `2361-...js` 171 KB (47 KB gzip); `f8df2737-...js` 169 KB (54 KB gzip); `main` 129 KB.
- three.js is imported dynamically in `shared/presentation/components/brand/logo-3d.tsx:25-27` and used by `HomeHero` on lg screens (`home-hero.tsx:~46`), i.e. on the center, therapist and platform home, and on public pages. It is off the critical path, but it is a ~172 KB gzip download plus a WebGL context and render loop on every first visit to the home of a logged-in user. A CSS/SVG mark in the authenticated app, keeping three.js only on public pages, would remove it from the daily screens.
- lucide-react: 81 files import it by name (tree-shaken; Next 15 optimizes `lucide-react` imports by default). No finding.
- Client vs server components: 145 of 244 `.tsx` files are `'use client'`; the 30 `page.tsx` are server files that re-export a client screen. Data screens cannot become server components because the access token lives only in memory and the API is called from the browser (`api-client.ts`, `session-context.tsx`). Components without hooks (`PageHeader`, `Card`, badges) are bundled as client code because their importers are client. Realistic gain: little in JS size; the wins are the auth waterfall (finding 6) and fewer requests.
- `next/dynamic` is used in only two places (`patient-record-view.tsx:25,29`: Progress and Board tabs). Candidates for the same treatment: `RegisterPatientDialog`, `BookAppointmentDialog` (214 lines), `PatientProgressSheet`, `PatientUsageSheet`, `AppointmentSheet`, the Settings sections, the audit export. Each is opened on demand; the gain per route is the route-specific part (about 10-35 KB gzip above the layout).
- Images: all avatars and pictograms are plain `<img>` with signed bucket URLs (`patient-avatar.tsx:21`, `pictogram-image.tsx:12`, `avatar-picker.tsx:45`, `app-shell.tsx:122`). Deliberate and reasonable for small SVG/PNG. `PatientAvatar` and the avatar picker have no `loading="lazy"`/`decoding="async"` (pictogram images do), which matters on the 100-avatar picker and 20-row tables. Because the signed query string changes every 30-60 minutes, the browser cache for them is short.
- Fonts: Figtree through `next/font/google` (self-hosted, two woff2 files, `display: swap`): fine.
- `output: 'standalone'` and nginx gzip are in place; no Brotli.
- A stale comment in `patient-record-view.tsx:24` still mentions Recharts, which is not a dependency.

---

## 8. Suggested order of work

1. W1 platform dashboard rewrite + cache + stop three screens from calling it (small change, removes the only whole-database scan).
2. Migration with the section 4 indexes (one migration, no code change except the audit `orderBy`).
3. Session counters (W2) and the `refreshUsage` change.
4. Overview query merge + server cache (W4).
5. Web: next-appointment endpoint for the shell, `GET /live/patients/:id`, debounce the palette, `staleTime` of 2-5 min for audited reads, `listRange` removal where the server can filter.
6. Auth refresh in parallel with JS, nginx `/api` directly to the API.
7. Correctness items 11-14.
