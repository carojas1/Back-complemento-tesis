# Audit: duplication, language, dead code, structure

Scope: BE = `<local path>` (381 .ts files, 18.7k lines), WEB = `<local path>` (≈346 .ts/.tsx files, 24.7k lines incl. JSX). Read-only. Tools run from the scratch folder: jscpd@4 (min-tokens 50), knip@5 (`--directory`, dummy env var for prisma.config.ts), plus small TypeScript-AST scripts in this folder. No .env was opened.

Caveat: WEB was being edited while I audited (landing-screen added, `logo-3d.tsx` and the `three` dependency removed, `next-therapy-card.tsx` became orphaned). Line numbers were re-verified at the end (about 15:00 on 2026-11-03); they can drift again.

Raw tool output: `jb/jscpd-report.json`, `jw2/jscpd-report.json`, `knipb.json`, `knipw2.json` in this folder.

---------------------------------------------------------------------------------------------------

## 0. Totals

| Section | BE | WEB |
| --- | --- | --- |
| jscpd clones (≥50 tokens) | 25 clones, 192 lines (1.0 %) | 16 clones, 168 lines (0.7 %) |
| Clones/duplicate logic worth removing (this report) | 11 | 12 |
| Files with Spanish comments | 260 of 381 (830 comment lines) | 0 of 346 (4 false positives: English comments quoting UI text) |
| Non-English identifiers / wire names / internal strings | 5 groups (see 2.3), plus 21 Spanish log lines, 9 Spanish internal `Error` texts | 1 (`ruc`, a domain term) |
| Non-Latin text | 0 (2 BOM U+FEFF characters, intentional) | 0 |
| Dead code | 4 unused devDependencies, 2 one-shot scripts, 12 unused `export`s, ~26 unused exported types | 1 orphan file, 2 dead endpoint entries, 1 dead CSS token, 1 unused asset, 11 unused exported symbols/types |
| Layering violations | 0 in domain, 0 in application against Prisma/Nest-HTTP; 17 use cases import `tenancy`; 82 files import the audit port from `auth` | 53 presentation files import `shared/infrastructure`; 1 presentation file calls the API client; 1 infra file bypasses the client; 2 application files import presentation; 12 shared→modules imports |
| Oversized / mixed files | 4 | 4 |

---------------------------------------------------------------------------------------------------

## 1. Duplication

### 1.1 Backend: clones worth removing (ranked by size x occurrences)

| # | What | Locations | Owner helper |
| --- | --- | --- | --- |
| B1 | `from/to/therapistId` date query written 3 times (19 + 18 lines, plus smaller copies) | `dashboard/infrastructure/http/dashboard.dto.ts:15-33`, `:40-57`, `:59-77`; `appointments/infrastructure/http/appointments.dto.ts:19-25`; `sessions/infrastructure/http/sessions.controller.ts:12-15` (a DTO living in the controller, file is `PeriodQuery`) | `common/http/period.query.ts`: `PeriodQuery` (from, to) and `TherapistPeriodQuery extends PeriodQuery`; the three dashboard DTOs extend it |
| B2 | "bump the global sync version" upsert + stamp profiles, 4 copies | `sync/infrastructure/prisma/sync.prisma.repository.ts:111-117`, `voices/infrastructure/prisma/voices.prisma.repository.ts:97-103`, `pictograms/infrastructure/prisma/pictograms.prisma.repository.ts:57-62`, `data-requests/infrastructure/prisma/patient-eraser.prisma.ts:85-90` | `sync/infrastructure/prisma/sync-version.ts`: `nextSyncVersion(tx)`; the sync module owns the counter |
| B3 | `isAssigned(patientId, therapistId)` implemented 4 times with the same `therapistPatient.count`; `patientCode(patientId)` 6 times (return type is `string \| undefined` in 3 ports and `string \| null` in 3) | isAssigned: `appointments/.../appointments.prisma.repository.ts:120`, `patients/.../patients.prisma.repository.ts:68`, `profiles/.../profiles.prisma.repository.ts:261`, `treatments/.../treatments.prisma.repository.ts:27`. patientCode: `appointments...:123`, `homework/.../homework.prisma.repository.ts:124`, `jobs/.../jobs.prisma.repository.ts:18`, `notes/.../notes.prisma.repository.ts:87`, `sessions/.../sessions.prisma.read-model.ts:121`, `treatments...:30`. A port `PatientAccess` already exists (`profiles/domain/ports/profiles.repository.ts:60`) and 10 use cases consume it | Make `PatientAccess` the only implementation (`isAssigned`, `patientCode`) and inject it into appointments, treatments, patients. One Prisma adapter |
| B4 | Day/minute/hour constants re-declared 9+ times; inline `30 * 24 * 60 * 60_000` / `24 * 60 * 60_000` elsewhere | `dashboard/application/analytics-period.ts:1`, `get-app-usage.use-case.ts:6`, `get-center-overview.use-case.ts:5`, `dashboard/infrastructure/prisma/dashboard.prisma.read-model.ts:26` (`dayMs`), `data-requests/domain/entities/data-request.entity.ts:8`, `institutions/infrastructure/prisma/institutions.prisma.repository.ts:18`, `notes/domain/entities/note.entity.ts:9`, `subscriptions/domain/entities/subscription.entity.ts:7`, `treatments/infrastructure/prisma/treatments.prisma.repository.ts:9`; `minute = 60_000` at `appointments/domain/entities/appointment.entity.ts:10`, `devices/domain/entities/device.entity.ts:16`; inline at `institutions/application/get-institution.use-case.ts:14`, `get-platform-dashboard.use-case.ts:12,15`, `platform.use-cases.ts:44`, `sessions/application/sessions.use-cases.ts:62`, `auth/domain/entities/refresh-token.entity.ts:24`, `pictograms/infrastructure/arasaac/arasaac-http.client.ts:34` | Export `minuteMs`, `hourMs`, `dayMs` from `common/time/center-time.ts` |
| B5 | "Ecuador day/week start" arithmetic written twice, outside the helper that already owns the UTC-5 offset | `dashboard/application/get-center-overview.use-case.ts:10-15` (`weekStartOf`) and `:33-34` (local midnight) vs `common/time/center-time.ts` (only has weekday and minute-of-day); `dashboard.prisma.read-model.ts:41-45` walks days again | Add `centerDayStart(date)`, `centerWeekStart(date)` to `common/time/center-time.ts` |
| B6 | Attendance/occupancy rate: guard + `ratio()` repeated at 5 sites (`completed + noShow > 0 ? ratio(...) : null`) | `dashboard.prisma.read-model.ts:216`, `:243`, `:252-257`, `:372`, `:379`; `ratio` defined at `:25` | `common/math/rate.ts`: `rateOf(part, whole)` returning `null` when `whole` is 0 (web repeats it too, see W2) |
| B7 | Pagination: `Promise.all([findMany({skip: skipOf(page), take: page.limit}), count({where})])` + `toPage(...)`, 31 call sites in 24 files | e.g. `appointments.prisma.repository.ts:60-65`, `audit.prisma.repository.ts:31-34`, `catalogs...:33-36`, `categories...:20-25,53-58`, `center...:21-24`, `data-requests...:40-52`, `devices...:86-92`, `family.prisma.read.ts:21-24,59-64`, `homework...:66-71`, `institutions...:48-54,155`, plus 14 more (grep `skipOf(`); `pictograms/application/search-arasaac.use-case.ts:21` slices in memory | `common/pagination/page.ts`: `paginate(delegate, args, page)` for Prisma delegates, plus `slicePage(items, page)` |
| B8 | "Local date-time stamp" (UTC minus 5 h, ISO sliced to minutes) in two renderers | `audit/infrastructure/export/audit-files.renderer.ts:9` (`localDateTime`), `sessions/infrastructure/pdf/pdfmake-report.renderer.ts:16` (`stamp`) | `common/time/center-time.ts`: `centerDateTime(date)` |
| B9 | `date.toISOString().slice(0, 10)` re-implemented 8 times although `isoDay` exists | `common/pdf/pdf.ts:74` (`isoDay`), `patients/application/patient-view.ts:4`, `sessions/infrastructure/prisma/sessions.prisma.read-model.ts:106`, `sessions/application/report-pdf.use-case.ts:24` (x2), `voices/application/create-voice.use-case.ts:66`, `voices/application/voice-view.ts:12`, `subscriptions/application/record-payment.use-case.ts:54`, `dashboard/application/get-center-overview.use-case.ts:22` | Move `isoDay` to `common/time/` and use it everywhere |
| B10 | Default period resolved two different ways: dashboard `resolvePeriod` (30 d default, cap 366 d) vs sessions report (30 d default, no cap, `to` defaults to now) | `dashboard/application/analytics-period.ts:6-12` vs `sessions/application/sessions.use-cases.ts:60-63`; `jobs/application/jobs.use-cases.ts:13` `Period` type is a third shape; "30 days ago" also at `get-center-overview.use-case.ts:41` (`monthAgo`), `institutions/application/get-institution.use-case.ts:14`, `get-platform-dashboard.use-case.ts:15`, `treatments/infrastructure/prisma/treatments.prisma.repository.ts:80` | Promote `resolvePeriod` to `common/time/period.ts` (with `lastDays(n, now)`), use in sessions report and the monthAgo sites |
| B11 | "Tablet offline after 7 days" threshold in three places, plus the web repeats it as text | `dashboard/application/get-app-usage.use-case.ts:7`, `get-center-overview.use-case.ts:7`, `devices/domain/entities/device.entity.ts:54` (`7 * 24 * 60 * minute`) | Export `staleAfterDays` from `devices/domain/entities/device.entity.ts` and import it in the dashboard use cases |

Boilerplate, optional: `audit.record({ actorType: 'USER', actorId, entity, entityId, ip, ... })` appears 67 times in 64 files (61 with `actorType: 'USER'`), e.g. `subscriptions/application/configure-subscription.use-case.ts:21-29` and `reactivate-subscription.use-case.ts:21-28` are the same shape. A `recordUserAction(audit, actor, {...})` helper would remove roughly 6 lines per use case. Lower value; do it only when touching those files.

### 1.2 Backend: intentional similarity (do not merge)

- `auth/domain/entities/password-reset.entity.ts:22-33` vs `devices/domain/entities/registration-code.entity.ts:31-42` (12 lines, `isUsable`/`markUsed`/`toSnapshot`): the entity pattern of the team. Three entities (plus `refresh-token.entity.ts:32`) share it; merging would couple unrelated modules.
- `voices/application/generate-voice-clips.use-case.ts:12-24` vs `get-voice.use-case.ts:11-23`: constructor and guard preamble of two separate use cases (one use case per file is the team rule).
- `categories/application/add-pictogram-to-category.use-case.ts` vs `remove-pictogram-from-category.use-case.ts` (lines 10-29), `catalogs/application/delete-catalog-item.use-case.ts:18-23` vs `update-catalog-item.use-case.ts:19-23`, `patients/application/get-patient.use-case.ts:18-23` vs `update-patient.use-case.ts:23-28` vs `set-patient-status.use-case.ts:22-28`, `institutions/application/save-request-notes.use-case.ts:20-30` vs `start-request-review.use-case.ts:18-27`, `profiles/application/set-recording.use-case.ts:51-59` vs `update-profile.use-case.ts:30-38`, `edit-board.use-case.ts:29-34`: load, guard, act, audit sequences of sibling routes.
- Import blocks of controllers: `notes.controller.ts:1-6` vs `subscriptions.controller.ts:1-6`, `notes.dto.ts:11-16` vs `sessions.controller.ts:12-17` (jscpd counts imports as clones).
- `common/audio/ffmpeg-word-audio.ts:1-7` vs `profiles/infrastructure/audio/ffmpeg-audio.converter.ts:1-7`: imports only; the two adapters differ (trim/loudness vs convert/probe). They do share the "temp dir, write input, run, read output, rm" skeleton and the `FFMPEG_PATH` lookup; extract only if a third ffmpeg adapter appears.
- `catalogs/domain/entities/catalog-item.entity.ts:33-38` vs `categories/domain/entities/category.entity.ts:41-46`, `profiles/infrastructure/prisma/profiles.prisma.repository.ts:190-196` vs `:200-206`, `auth/infrastructure/http/auth.dto.ts:14-21` vs `:76-83` (two password DTOs; a `@StrongPassword()` decorator is possible but not needed).
- Near-identical DTOs of different routes (`institutions.dto.ts`, `devices.dto.ts`, `patients.dto.ts`): intentional, each route owns its contract.

### 1.3 Backend: `trim` transform defined 4 times (and exported from the wrong module)

`auth/infrastructure/http/auth.dto.ts:7` (exported) is imported by 10 DTO files of other modules: `catalogs.dto.ts:4`, `categories.dto.ts:4`, `data-requests.dto.ts:4`, `devices.dto.ts:5`, `patients.dto.ts:4`, `pictograms.dto.ts:4`, `settings.dto.ts:5`, `users.dto.ts:6`, and so on. It is also re-declared in `homework/infrastructure/http/homework.dto.ts:7`, `notes/infrastructure/http/notes.dto.ts:8`, `voices/infrastructure/http/voices.dto.ts:5`. Owner: `common/http/transforms.ts` (`trim`). This is the cheapest clone to remove (13 files).

### 1.4 Web: clones worth removing

| # | What | Locations | Owner helper |
| --- | --- | --- | --- |
| W1 | Therapist/specialty/room filter bar, 40 lines identical; the "distinct specialties" memo exists 3 times | `appointments/presentation/components/schedule-board.tsx:200-239` = `dashboard/presentation/screens/analytics-screen.tsx:91-127`; specialties memo: `schedule-board.tsx:99-106`, `analytics-screen.tsx:60-67`, `patients/presentation/screens/center-patients-screen.tsx:23` | `users/presentation/components/therapist-filter.tsx` (select of team + specialty) and `users/application/specialties.ts` (`specialtiesOf(therapists)`) |
| W2 | Attendance rate `Math.round((1000 * completed) / (completed + noShow)) / 10` in 3 places, `closed = completed + noShow` in 4 | `dashboard/presentation/components/analytics-summary.tsx:18-19`, `attendance-chart.tsx:11-12`, `dashboard/presentation/screens/center-home-screen.tsx:29-30`; `closed`: `chart-stories.ts:6`, `patient-usage-panel.tsx:40`, `therapist-home-screen.tsx:27`. Percent-of-total again at `chart-stories.ts:22`, `usage-stories.ts:79`. The API already returns `rate` for the same data (B6), so the by-specialty/by-therapist rows should receive `rate` from the API | `dashboard/domain/attendance.ts`: `attendanceRate(counts)`, `closedCount(counts)`; ask the API for `rate` on all rows |
| W3 | Payments table written twice (12 + 13 lines identical) | `subscriptions/presentation/components/payment-history.tsx:27-49` = `subscriptions/presentation/screens/payments-screen.tsx:38-68` (the screen adds a "Centro" column) | `subscriptions/presentation/components/payments-table.tsx` with `showCenter` |
| W4 | Period resolution written 3 ways: presets + custom (`use-period.ts`), analytics presets (`analytics-screen.tsx:55-60`), audit range (`audit.api.ts:11-14`); the local-day parse `new Date(\`${x}T00:00:00\`)` at 5 places | `sessions/application/use-period.ts:23` (`localDay`), `dashboard/presentation/screens/analytics-screen.tsx:58`, `audit/infrastructure/audit.api.ts:12-13`, `appointments/presentation/components/schedule-board.tsx:80`, plus UTC variant `sessions/application/report-series.ts:4` | `shared/utils/format.ts` (or new `shared/utils/dates.ts`): `parseLocalDay`, `endOfLocalDay`; `usePeriod` reused by analytics |
| W5 | Time constants: `minute = 60_000` x4, `hour`, `dayMs`, `86_400_000`, and "minutes between two ISO strings" x3 | `appointments/application/use-therapy-reminders.ts:9`, `appointments/presentation/components/day-rail.tsx:14`, `next-therapy-card.tsx:9`, `next-therapy-chip.tsx:11`, `institutions/presentation/components/contact-countdown.tsx:7`, `data-requests/domain/data-requests.types.ts:46`, `dashboard/application/usage-stories.ts:36`; duration: `appointments/application/schedule-view.ts:15` (`durationMinutes`), `book-appointment-dialog.tsx:63`, `day-board.tsx:170`; minute-of-day x3: `schedule-view.ts:8`, `day-board.tsx:38`, `schedule-board.tsx:126` | `shared/utils/time.ts`: `minuteMs`, `hourMs`, `dayMs`, `minutesBetween(a, b)`, `minuteOfDay(date)` |
| W6 | `locale = 'es-EC'` redeclared and inlined although `format.ts` owns it | declared: `appointments/presentation/components/day-rail.tsx:13`, `week-strip.tsx:9`, `dashboard/application/usage-stories.ts:6`; inline: `boards/.../board-settings-card.tsx:36`, `pictogram-audio-panel.tsx:14`, `sessions/application/report-series.ts:18`, `sessions/presentation/components/improvement-charts.tsx:10`, `session-detail-view.tsx:63`, `shared/presentation/components/labels/count-up.tsx:46`. `weekLabel` (`report-series.ts:18`) is `formatWeekShort` (`format.ts:68`) with another field order | Export `locale` and number formatters (`formatNumber`, `formatSeconds`) from `shared/utils/format.ts`; delete `weekLabel` |
| W7 | `audit.api.ts` re-implements the shared client: query-string builder (`toSearch`, `:16-21` vs `withQuery` in `shared/infrastructure/http/api-client.ts:54-61`) and the 401 refresh+retry (`:25-30` vs `api-client.ts:76-78, 94`); `jobs/infrastructure/jobs.api.ts:12` builds `?from&to` by hand | `modules/audit/infrastructure/audit.api.ts:16-30` | `api.getBlob(path, query)` in `api-client.ts` and `saveBlob()` in `shared/utils/` |
| W8 | Spanish plural ternary (`=== 1 ? 'x' : 'xs'`) 27 times in 22 files plus a local `counted` | `dashboard/presentation/screens/center-home-screen.tsx:20` (`counted`), `sessions/presentation/components/improvement-charts.tsx:10`, and 25 more (grep `=== 1 ?`) | `shared/utils/format.ts`: `formatCount(n, one, many)` |
| W9 | Same JSX/logic blocks in sibling forms | `notes/presentation/components/goal-composer.tsx:35-47` = `note-composer.tsx:37-46`; `auth/presentation/screens/change-password-screen.tsx:21-38` = `reset-password-screen.tsx:19-32` (`NewPasswordFields` already exists in `auth/presentation/components/new-password-fields.tsx`; add `useNewPasswordForm`); `patients/presentation/components/edit-patient-form.tsx:36-50,72-78` = `register-patient-form.tsx:37-51,73-79`; `boards/presentation/components/arasaac-results.tsx:13-19` = `saved-pictogram-results.tsx:13-19`; `devices/.../registration-code-sheet.tsx:121-134` = `settings/.../center-pin-section.tsx:62-75`; `settings/.../center-data-section.tsx:4-13`, `center-pin-section.tsx:4-12`, `center-logo-section.tsx:6-14` (section header) | `patients/presentation/components/patient-fields.tsx` (shared fields), `useNewPasswordForm`, a `SettingsSection` wrapper |
| W10 | `try { await m.mutateAsync(..); toast(ok) } catch (e) { toast('danger', errorMessage(e)) }`: 49 `mutateAsync` sites, 9 with the identical `toast('danger', errorMessage(e))` | grep `toast('danger', errorMessage` (9 files, e.g. `schedule-board.tsx:147`) | `shared/application/use-action.ts` (`useAction(fn, {success})` that toasts errors) |
| W11 | Audit action labels exist twice in Spanish (66 codes in the API for exports, 74 in the UI); the two lists have drifted: the API has no label for 11 platform codes (`INSTITUTION_*`, `SUBSCRIPTION_*`) | BE `audit/domain/audit-labels.ts:1-74`, WEB `modules/audit/domain/audit-labels.ts:1-289` | One source: the API returns `label` per record (`GET /audit` already knows the action) and the UI stops shipping 289 lines of labels |
| W12 | Web re-derives backend constants as UI text: "30 días", "7 días" | `dashboard/presentation/screens/center-home-screen.tsx:50,56,63,96,98`, vs BE B10/B11 | Return the thresholds in the `GET /dashboard` payload |

### 1.5 Web: intentional similarity

`shared/presentation/layouts/center-layout.tsx:3-13` vs `therapist-layout.tsx:3-13` (imports and shell wiring of two roles); `landing-screen.tsx:37-43` vs `:152-158` (two list items of the landing); chart components of the same family. Keep.

---------------------------------------------------------------------------------------------------

## 2. Language rule

Rule applied: code, identifiers, file names, routes, query parameters, enum values, logs and DB names in English; only text an end user reads may be Spanish. "End user" counted as: UI text, API error `message`/`safeMessage` (207 class-validator messages and 101 exception classes), exported files (CSV/XLSX/PDF/ZIP), emails, notification text.

### 2.1 Files with Spanish comments per module

BE (comments judged Spanish by accents or function-word heuristic; comment lines in parentheses):

| module | files | files with ES comments | | module | files | files with ES comments |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| appointments | 13 | 0 | | pictograms | 16 | 14 (40) |
| audit | 11 | 7 (13) | | prisma | 2 | 2 (15) |
| auth | 32 | 29 (103) | | profiles | 15 | 14 (52) |
| catalogs | 13 | 11 (18) | | scripts | 2 | 2 (18) |
| categories | 15 | 13 (20) | | sessions | 7 | 7 (22) |
| center | 12 | 0 | | settings | 13 | 11 (21) |
| common | 15 | 10 (48) | | subscriptions | 13 | 0 |
| dashboard | 10 | 0 | | sync | 16 | 15 (74) |
| data-requests | 18 | 18 (49) | | tenancy | 2 | 2 (15) |
| devices | 16 | 15 (46) | | treatments | 8 | 0 |
| family | 7 | 4 (8) | | users | 16 | 14 (28) |
| health | 5 | 0 | | vocabulary | 5 | 5 (6) |
| homework | 8 | 6 (10) | | voices | 16 | 16 (58) |
| institutions | 17 | 9 (47) | | (root: app/main/worker) | 5 | 5 (18) |
| jobs | 12 | 12 (54) | | | | |
| limits | 7 | 0 | | | | |
| notes | 7 | 4 (9) | | | | |
| notifications | 11 | 0 | | **TOTAL** | **381** | **260 (830 lines)** |

Also `prisma/schema.prisma`: 91 of 114 comment lines are Spanish (identifiers and enums are English). 26 of the 43 source files that differ from `_upstream/caa-backend/src` still carry Spanish comments (e.g. `audit/application/export-audit.use-case.ts`, `settings/**`, `sync/application/process-batch.use-case.ts`, `auth/infrastructure/mail/auth.mailer.ts`). The English modules are exactly the new ones (appointments, center, dashboard, health, limits, notifications, subscriptions, treatments).

WEB: 0 files with Spanish comments. The four hits are English comments quoting UI words: `boards/domain/board-preview.ts:27`, `boards/presentation/components/board-editor.tsx:43`, `shared/presentation/components/charts/column-chart.tsx:11`, `shared/presentation/components/labels/copy-code.tsx:29`.

### 2.2 Spanish where English is required (BE), not user-facing

Log messages (21):

| file:line | text |
| --- | --- |
| `auth/infrastructure/mail/auth.mailer.ts:67,82` | `[SIN SMTP] Para: ...` |
| `auth/infrastructure/prisma/auth-audit.prisma.ts:31` | `No se pudo auditar ...` |
| `data-requests/application/execute-deletion.use-case.ts:37` | `Eliminación ...: no se borraron del bucket ...` |
| `health/infrastructure/prisma/database.prisma.probe.ts:27` | `Base de datos caída: ...` |
| `institutions/application/create-institution-admin.use-case.ts:48` | `No se pudo enviar la bienvenida del administrador ...` |
| `institutions/application/platform.use-cases.ts:107` | `No se pudo enviar la bienvenida de ...` |
| `institutions/application/request-institution.use-case.ts:42` | `Solicitud ...: no se pudo enviar el correo: ...` |
| `jobs/application/jobs.worker.ts:42,47,106` | `Fallo del worker`, `Limpieza`, `Trabajo ..., intento ...` |
| `main.ts:33,37` | `API en el puerto ...`, `No se pudo iniciar la aplicación` |
| `notifications/infrastructure/prisma/notifications.prisma.repository.ts:64` | `No se pudo publicar la notificación ...` |
| `scripts/fill-word-types.ts:52`, `scripts/fix-word-audio.ts:43,93` | `No se pudo llenar el tipo de palabra`, `«...» (voz ...)`, `No se pudieron arreglar los audios` |
| `voices/application/voice-job.runner.ts:42,83` | `Voz ...: ...` |
| `worker.ts:12,16` | `Worker de la cola en marcha`, `No se pudo iniciar el worker` |

Logger contexts in Spanish: `scripts/fix-word-audio.ts:43,93` (`'ArreglarAudios'`), `scripts/fill-word-types.ts:52` (`'TipoDePalabra'`).

Internal (never shown) `Error`/reason strings in Spanish: `auth/infrastructure/mail/auth.mailer.ts:22`, `health/infrastructure/prisma/database.prisma.probe.ts:21`, `prisma/prisma.service.ts:17,71`, `tenancy/tenancy.ts:22`, `voices/infrastructure/clone/clone-voice.synthesizer.ts:25,34,44,49`. Reason codes passed to `DomainException` and written to the log: `auth/application/refresh-session.use-case.ts:21 ('desconocido')`, `:24 ('rotado hace un momento')`, `:28 ('reutilizado')`, `:30 ('vencido')`; `devices/application/authenticate-device.use-case.ts:24 ('token desconocido')`, `:25 ('revocada')`, `:28 ('fecha fuera de rango')`; `devices/application/register-device.use-case.ts:28 ('vencido o usado' / 'inexistente')`. The client sees `safeMessage` for these, so they are log-only and should be English.

Developer-facing text in Spanish: 142 of 153 `@ApiOperation` summaries and 67 `description:` values (Swagger), plus the example passwords in `auth/infrastructure/http/auth.dto.ts:10,16,24,60,78` and `users/infrastructure/http/users.dto.ts:38,86` (`ClaveTemporal1`, `NuevaClave2026`, `Contrasena123`, `Temporal2026`). Judgement call: Swagger is read by developers, not end users.

Temp-file names: `profiles/infrastructure/audio/ffmpeg-audio.converter.ts:21-23` (`grabacion-`, `entrada`, `salida.m4a`), `common/audio/ffmpeg-word-audio.ts:34-36` (`palabra-`, `entrada.${format}`, `salida.${format}`).

### 2.3 Non-English identifiers, wire names and data

| Where | Item | Can it change? |
| --- | --- | --- |
| `voices/infrastructure/clone/clone-voice.synthesizer.ts:7` | type fields `tipo`, `archivo`, `mensaje` | Wire format of the external `Clonar-voz` FastAPI service (not the tablet). Keep on the wire; map to English in the adapter (`Event { type, file, message }`) |
| same file `:22,23,31,32` | multipart fields `nombre`, `transcripcion`; JSON body `{ texto, voz, idioma: 'es' }`; response `archivo`; local variables `archivo` (`:31,32,47,51`) | Same service contract; rename the locals now, the wire keys only with the service |
| same file `:43,44` | event types `'fin'`, `'error'`, `'cancelada'`, field `tipo`, `mensaje` | Same service contract |
| `scripts/fix-word-audio.ts:87` | summary keys `perfiles`, `vocesARegenerar` | Free to rename (script output) |
| `data-requests/domain/entities/data-request.entity.ts:13` | `anonymousPatientCode = 'ANONIMO'` (value stored as a patient row, filtered at `dashboard.prisma.read-model.ts:69,297,391,418` and in `test/data-requests.e2e-spec.ts`) | The identifier is English; the stored value is Spanish data. Changing it needs a data migration. Not tablet-bound (excluded from tablet sync per `data-requests/README.md:39`) |
| `institutions/**` (`ruc`: `institution-request.entity.ts:13,36`, `institutions.dto.ts:33`, `institutions.prisma.repository.ts:34,38,94,151`, `institutions.repository.ts:60-61`; WEB `institutions/domain/institutions.types.ts:21,36,101`) | `ruc` (Ecuadorian taxpayer id) in column, DTO field, port methods `pendingWithRuc`, `institutionWithRuc` | It is a proper noun of the domain, same as `LOPDP`. Keep; it is part of the public `/institution-requests` contract |
| `prisma/prisma.service.ts:8,16,36`, `compose.yaml:3`, `docker-compose.dev.yaml:4,7` | `necon` (product name) and the DB role `necon_app` | Brand, not Spanish |
| WEB `modules/audit/infrastructure/audit.api.ts:26` | default download name `auditoria.${format}` | User-facing file name; acceptable, but the API sends `Content-Disposition` so this only runs when the header is missing |

Verified clean (all English): all 100+ route segments in `@Controller/@Get/@Post/...` (BE), every Next.js route segment and folder under `src/app` (WEB), query parameter names, DTO property names, Prisma model/enum names and enum values (`prisma/schema.prisma`), file and folder names in both codebases, CSS class names (`globals.css`), localStorage/lock keys, header names (`X-App-Key`, `X-Device-Timestamp`, `X-Device-Signature`), sync event type `pictogram_tapped`.

Tablet-bound check: everything the tablet consumes (routes, headers, JSON fields, enums, event type `pictogram_tapped`, error shape `{statusCode, error, message}` read in `caa-mobile-main/src/services/api.ts`) is already English. No non-English item in section 2.3 is tablet-bound. The only external contract with Spanish names is the voice-cloning service. Spanish `message` texts are rendered by the tablet; keep them.

Other Spanish-looking data that is legitimately user-facing (not findings): ZIP export column names (`data-requests/infrastructure/export/zip-export.archive.ts:19-114`: `fecha_meta`, `fecha_limite`, `primer_intento`, ... in snake_case Spanish, part of the data-portability export), PDF and CSV headers (`sessions/infrastructure/pdf/pdfmake-report.renderer.ts`, `audit/application/export-audit.use-case.ts:7`), the grouping label `'Sin especialidad'` (`dashboard.prisma.read-model.ts:233`, sent as data), and category example `Emociones`.

### 2.4 Non-Latin text

None. No CJK, Cyrillic, Arabic, emoji or box-drawing characters in `src`, `prisma` or `test` of either codebase. Only two invisible characters: U+FEFF (BOM) at `audit/application/export-audit.use-case.ts:38` and `data-requests/infrastructure/export/zip-export.archive.ts:8`, both intentional (Excel opens UTF-8 CSV with accents). Replace the literal with `'\uFEFF'` so a reviewer can see it.

### 2.5 Web language notes

- Identifiers: only `ruc`. UI strings are Spanish (allowed). One English runtime error: `auth/application/session-context.tsx:75`.
- Hard-coded Spanish pluralisation and locale: see W6, W8.

---------------------------------------------------------------------------------------------------

## 3. Dead code

### 3.1 Backend

- devDependencies not referenced anywhere (config, scripts, source): `@eslint/eslintrc` (`eslint.config.mjs` uses `@eslint/js`, `typescript-eslint`), `source-map-support`, `ts-loader`, `tsconfig-paths` (`package.json:62,84,87,89`; Nest scaffold leftovers). `@nestjs/testing`, `supertest`, `@types/supertest` are used by `test/app.ts` (knip lists them only because the jest config is not auto-detected). All `dependencies` are used.
- One-shot scripts shipped in `dist` and not wired in `package.json`: `src/scripts/fill-word-types.ts` (ran when the migration `20261025190000_word_type` was applied) and `src/scripts/fix-word-audio.ts` (README of voices says "se corrió una vez el 2026-10-25", `voices/README.md:44`). Move out of `src/` or delete after confirming production already ran them.
- Unused `export` keyword (the symbol is used inside its own file, or only in tests): `AllowTemporaryPassword` in `auth/index.ts:4` (barrel entry, never imported through the barrel), `NoteNotFound` (`notes/application/notes.use-cases.ts:11`), `SessionNotFound` (`sessions/application/sessions.use-cases.ts:9`), `recordingRules` (`profiles/application/set-recording.use-case.ts:17`), `PeriodQuery` (`sessions/infrastructure/http/sessions.controller.ts:12`), `reuseGraceMs` (`auth/domain/entities/refresh-token.entity.ts:10`), `wordRules` (`common/audio/word-audio.ts:9`), `maxImageSide` (`pictograms/domain/entities/pictogram.entity.ts:30`), `pdfStyles` (`common/pdf/pdf.ts:9`), `CenterHoursEntryDto` (`center/infrastructure/http/center.dto.ts:42`), `HomeworkDone` (`homework/domain/entities/homework.entity.ts:9`, used by `test/family.e2e-spec.ts`), `NoteLocked` (`notes/domain/entities/note.entity.ts:3`, used by `test/sessions.e2e-spec.ts`).
- Unused exported types (26): `CategorySummary` (`categories/domain/ports/categories.repository.ts:5`), `ChildInfo`, `SharedNote` (`family/domain/ports/family.read.ts:12,19`), `Health` (`health/application/check-health.use-case.ts:4`), `PatientRef` (`data-requests/.../data-requests.repository.ts:23`, `sync/.../sync.repository.ts:60`), `InstitutionAdmin`, `InstitutionUsage`, `CenterActivity`, `PlatformStats` (`institutions/domain/ports/institutions.repository.ts:17,27,36,47`), `Requester`, `Period` (`jobs/application/jobs.use-cases.ts:12,13`), `NoteRow`, `GoalRow` (`notes/domain/ports/notes.repository.ts:4,8`), `BoardPictogram`, `SessionDetail`, `PaymentRow`, `TreatmentPlanView`, `SpreadsheetColumn`, `Deadline`, `JobView`, `SubscriptionStatus`, `EffectiveStatus`, `WordAudioResult`, `ImageType`.
- No unused abstract port methods (every `abstract` method in a `domain/ports` file has a caller).
- No orphan source files (the entry points `worker.ts` and `worker.module.ts` are used by `start:worker*`).
- The `_parked/subscriptions-2026-10-31` folder documents the plan as archived, yet `SubscriptionsModule` is registered at `app.module.ts:39,106` and the web has Pagos screens; the repository carries both the live code and the parked copy. Decide which is real.

### 3.2 Web

- Orphan file: `modules/appointments/presentation/components/next-therapy-card.tsx` (52 lines, not imported by anything; knip).
- Dead endpoint entries: `shared/infrastructure/http/endpoints.ts:59` (`patients.consent`) and `:66` (`patients.homework`); no `.consent` / `.homework` use anywhere.
- Dead CSS token: `--color-caution` (`app/globals.css:76`); not referenced in CSS or TSX. All 41 custom classes, all keyframes and the other 60 theme tokens are used.
- Unused asset: `public/brand/logo.svg` (`docs/02 -Web/Despliegue.md:70` says no screen uses it; `app/icon.svg` carries the same drawing).
- Unused exports: `weekLabel` (`sessions/application/report-series.ts:18`, only used inside the file; also W6), `CardLink` (`shared/presentation/components/cards/card.tsx:23`, now only used by the orphan file above).
- Unused exported types: `ApiErrorBody` (`shared/infrastructure/http/api-error.ts:3`), `Preferences` (`settings/application/preferences.ts:11`), `PreviewCell`, `PreviewTab` (`boards/domain/board-preview.ts:5,7`), `AudioTake` (`boards/application/use-audio-recorder.ts:3`), `HeatCell` (`shared/presentation/components/charts/activity-heatmap.tsx:5`), `TimeChart` (`dashboard/application/usage-stories.ts:10`), `CommandItem` (`shared/presentation/components/navigation/command-palette.tsx:12`), `ButtonProps` (`shared/presentation/components/buttons/button.tsx:17`), `BarSeries`, `BarRow` (`charts/bar-rows.tsx:3,9`), `LinePoint` (`charts/line-chart.tsx:7`).
- package.json: no unused dependencies at the time of the final run (`three`/`@types/three` were removed during the audit; make sure the lockfile follows). knip's `eslint-config-next` (used through `compat.extends('next/core-web-vitals')`) and `postcss` (unlisted) are false positives.
- No unreferenced routes: every key of `shared/config/routes.ts` is used; every `src/app` page is reachable from `routes`.

---------------------------------------------------------------------------------------------------

## 4. Structure

### 4.1 Layer checks that came back clean (BE)

- `*/domain/**`: zero imports of `@nestjs`, `@prisma`, `infrastructure`, `application` or any package (domain has no external import at all).
- `*/application/**`: only `@nestjs/common` (`Injectable`, `Logger`, `OnModuleDestroy`) and `node:crypto` (`randomUUID`, 6 files); no Prisma, no `process.env`, no `fetch`.
- No controller or DTO imports Prisma. Prisma appears only in `*/infrastructure/prisma/**`, `prisma/`, `tenancy/tenancy.ts`, `scripts/` (2 files).
- Every domain/application layer folder exists in all 31 modules; every module has `README.md` except the 4 non-module folders `common`, `prisma`, `scripts`, `tenancy`.

### 4.2 Backend findings

| # | Finding | File:line | Fix |
| --- | --- | --- | --- |
| BS1 | The audit port and the union of every module's action codes live in the `auth` module (`AuthAuditLog`, `AuthAuditAction`, `AuthAuditEntry`); 82 files in 28 modules import it from `../../auth/domain/ports/auth-notifications.ports` (same file also holds `AuthMailer`). Appointments, institutions, subscriptions, center, devices actions are declared inside `auth` | `auth/domain/ports/auth-notifications.ports.ts:11-131` (`AuthAuditAction` 11-88, `AuthAuditLog` 129) | Move to `audit/domain/ports/audit-log.ts` (or `common/audit`), rename `AuditLog`/`AuditAction`; leave `AuthMailer` where it is |
| BS2 | Use cases import a concrete `AsyncLocalStorage` module (`tenancy/tenancy.ts`) for `inInstitution`, `enterInstitution`, `currentInstitution`, `baseInstitutionId`: 17 files | `auth/application/{forgot-password:2,login:2,logout:2,refresh-session:2,reset-password:2}.use-case.ts`, `devices/application/register-device.use-case.ts:2`, `institutions/application/{create-institution-admin:5,get-institution:2,platform.use-cases:8,set-institution-status:4,update-institution:3}`, `jobs/application/jobs.worker.ts:4`, `settings/application/set-center-logo.use-case.ts:5`, `subscriptions/application/{cancel-subscription:4,configure-subscription:3,reactivate-subscription:3,record-payment:4}.use-case.ts` | Put a `TenantScope` port (`run(institutionId, fn)`) in `common/` and implement it in `tenancy/`; the use cases would not touch Node internals |
| BS3 | Shared HTTP helper exported by one module and imported by others (infrastructure to infrastructure across modules) | `auth/infrastructure/http/auth.dto.ts:7` (`trim`) imported by 8 modules; `devices/infrastructure/http/device-auth.ts` imported by `sync/*`, `users/*`, `vocabulary/*`, `institutions/infrastructure/http/public-client.guard.ts:4`; `auth/infrastructure/prisma/auth.prisma.repository.ts` (`accountKey`) imported by `institutions/infrastructure/prisma/institutions.prisma.repository.ts:4`; `devices/...devices.prisma.repository` (`deviceKey`) same file `:5`; `pictograms`/`categories` mappers imported by `profiles`, `vocabulary`, `categories` | Move to `common/http` / shared mappers; `institutions` repository reads other modules' tables directly through their key helpers |
| BS4 | Controller holds a DTO (breaks "one `<module>.dto.ts` per module") | `sessions/infrastructure/http/sessions.controller.ts:12-15` (`PeriodQuery`); `sessions`, `health`, `limits`, `vocabulary` have no `*.dto.ts` | Create `sessions.dto.ts` |
| BS5 | Grouped use-case classes in one file (team rule: one use case per class and file); 6 files, 41 methods | `family/application/family.use-cases.ts` (99 lines, 9 methods), `notes/application/notes.use-cases.ts` (118, 9), `institutions/application/platform.use-cases.ts` (150, 6; the rest of `institutions/application` is already one per file), `homework/application/homework.use-cases.ts` (93, 5), `sessions/application/sessions.use-cases.ts` (67, 5), `jobs/application/jobs.use-cases.ts` (54, 5) | Split like the already-split modules; `platform.use-cases.ts` is the one your team added, so start there |
| BS6 | Oversized files that mix several use cases' queries | `dashboard/infrastructure/prisma/dashboard.prisma.read-model.ts` (470 lines: `centerOverview`+`insights` 60-151, `analytics` 152-265, `patientUsage` 266-384, `appUsage` 385-470, plus helpers at 20-54); `institutions/infrastructure/prisma/institutions.prisma.repository.ts` (286: onboarding requests 29-146, institutions 147-224, platform stats 226+); `profiles/infrastructure/prisma/profiles.prisma.repository.ts` (263); `institutions/infrastructure/http/institutions.dto.ts` (227) | One read model per use case (dashboard has 4 use cases and 4 matching methods); split institutions into `requests` and `institutions` repositories (port already has 21 abstract methods in `institutions/domain/ports/institutions.repository.ts`) |
| BS7 | Non-module folders at the root of `src` without README, and one-off scripts inside `src` | `src/scripts/*` (2 files), `src/tenancy/*`, `src/prisma/*` | Fine as cross-cutting; scripts belong outside `src` (see 3.1) |
| BS8 | Inconsistent entry to `auth`: 20 files import the barrel `from '../../../auth'`, 37 import `auth/domain/entities/user.entity` directly for `Role` | e.g. `appointments/infrastructure/http/appointments.controller.ts:4` vs `appointments/application/appointment-rules.ts:1` | `Role` is domain vocabulary shared by all modules; export it from `common/` or use the barrel everywhere |

### 4.3 Web findings

| # | Finding | File:line | Fix |
| --- | --- | --- | --- |
| WS1 | Presentation calls the HTTP client and the endpoint table directly (a "query" inside a UI component) | `shared/presentation/components/navigation/command-palette.tsx:8-9,45` (`api.get(endpoints.treatments.progress ...)`) | Hook `useCommandPatients(term)` in `treatments/application/` and pass results through props or a slot |
| WS2 | 53 presentation files import `shared/infrastructure/http/api-error` just for `errorMessage` / `isApiError` (47 + 4 + 1 files; the other 2 infra imports are WS1) | e.g. `modules/appointments/presentation/components/appointment-list.tsx:9`, `modules/auth/presentation/screens/login-screen.tsx:11`, ... | `errorMessage` and `isApiError` are pure; move to `shared/domain/api-error.ts` (class `ApiError` stays in infrastructure) or re-export from `shared/application/` |
| WS3 | A fetch outside the shared client | `modules/audit/infrastructure/audit.api.ts:26` | See W7 (`api.getBlob`) |
| WS4 | Application layer imports from presentation (dependency inverted) | `modules/dashboard/application/usage-stories.ts:2-3` imports `weekdayName` and `Column` from `shared/presentation/components/charts/*` | Move `weekdayName` and the `Column` type to `shared/domain/` or `shared/utils/` |
| WS5 | `shared` depends on feature modules (12 imports) and holds role-specific layouts | `shared/presentation/layouts/center-layout.tsx:5-8`, `therapist-layout.tsx:5-8`, `platform-layout.tsx:5`, `app-shell.tsx:8-9`; `shared/config/routes.ts:1` and `shared/infrastructure/http/api-client.ts:2` import types from `modules/auth/domain/auth.types` | Move the three role layouts into `src/app/<role>/layout.tsx` or into the owning modules (e.g. `auth`), keep `AppShell` in shared and generic; move `Role` and `SessionResponse` to `shared/domain/` |
| WS6 | Business rules inside screens | `dashboard/presentation/screens/center-home-screen.tsx:29-31` (attendance rate) and `:37-71` (the rules that decide which attention items exist; 35 lines); `therapist-home-screen.tsx:25-31` (counts and sort by next appointment); `dashboard/presentation/screens/analytics-screen.tsx:55-60` (period range); `appointments/presentation/components/schedule-board.tsx:84-133` (week range, status filter, lanes, axis) | Move to `dashboard/application/{attention-items,attendance}.ts`, `appointments/application/use-schedule-board.ts` (lanes, axis, range), `dashboard/application/analytics-range.ts` |
| WS7 | Cycles between modules | appointments to settings (`appointments/application/use-therapy-reminders.ts:5`) and settings to appointments (`settings/presentation/components/preferences-section.tsx:11`); patients to users (`patients/presentation/components/register-patient-form.tsx:8`) and users to patients (`users/presentation/components/assign-patients-section.tsx:5-6`, `users/infrastructure/users.api.ts:1`); institutions to subscriptions (`institutions/domain/institutions.types.ts:1`) and subscriptions to institutions (`subscriptions/presentation/screens/payments-screen.tsx:6`) | Extract the shared piece (`preferences`, patient/therapist reference types) to `shared/domain/` |
| WS8 | Layout deviation from "web mirrors backend names": `boards` has no backend module (it covers `profiles` + `pictograms` + `categories` + `voices`); backend modules `catalogs`, `family`, `homework`, `sync`, `vocabulary`, `voices`, `health`, `tenancy` have no web module (expected for tablet-only features) | `modules/boards/**` (31 files) | Rename to `profiles` (and let pictograms/categories be sub-folders), or document the mapping |
| WS9 | Oversized files that should split | `appointments/presentation/components/schedule-board.tsx` (321 lines: state, filters, lanes, axis, header, filter bar, 3 views; extract `use-schedule-board.ts`, `ScheduleToolbar`, `ScheduleFilters`); `shared/presentation/layouts/app-shell.tsx` (261; `MenuList` 47-112 and `BrandTile` 113-125 (AppShell starts at 126) are components of their own); `audit/domain/audit-labels.ts` (289, data; see W11); `appointments/presentation/components/day-board.tsx` (229, drag math inside the component) | as listed |
| WS10 | `PatientUsagePage` re-declares `Page<T>` fields instead of `Page<PatientUsage> & { counts }` | `dashboard/domain/dashboard.types.ts:87-94` vs `shared/domain/page.ts` | Reuse `Page<T>` |
| WS11 | Timezone inconsistency between layers: the API buckets days and weeks in fixed UTC-5 (`common/time/center-time.ts:2`), the web buckets in the browser's time zone while documenting "in the center's time" (`shared/utils/format.ts:51-55,59`) | `shared/utils/format.ts:51-55` vs `caa-backend-pr/src/dashboard/application/get-center-overview.use-case.ts:10-15` | For a user outside Ecuador the weekly series and the agenda days disagree. Decide the rule once; put it in `shared/utils/` and use the same Monday and midnight definition |

---------------------------------------------------------------------------------------------------

## 5. Ten most valuable fixes (ordered by value per effort)

1. BE `trim` x4 and cross-module import: `auth/infrastructure/http/auth.dto.ts:7` (+ `homework.dto.ts:7`, `notes.dto.ts:8`, `voices.dto.ts:5`, 8 importing DTOs) into `common/http/transforms.ts`.
2. BE patient access: delete the duplicate `isAssigned`/`patientCode` at `appointments.prisma.repository.ts:120,123`, `patients.prisma.repository.ts:68`, `treatments.prisma.repository.ts:27,30` and use `PatientAccess` (`profiles/domain/ports/profiles.repository.ts:60`).
3. BE audit port ownership: `auth/domain/ports/auth-notifications.ports.ts:11-131` to `audit` (82 importers).
4. BE sync version bump x4: `sync.prisma.repository.ts:111`, `voices.prisma.repository.ts:97`, `pictograms.prisma.repository.ts:57`, `patient-eraser.prisma.ts:85`.
5. BE time helpers: `dayMs` x9 + `centerDayStart`/`centerWeekStart` + `resolvePeriod` for sessions (`analytics-period.ts:6`, `sessions.use-cases.ts:60-63`, `get-center-overview.use-case.ts:10-34`, `audit-files.renderer.ts:9`, `pdfmake-report.renderer.ts:16`).
6. BE `PeriodQuery` base DTO: `dashboard.dto.ts:15-77` (3 copies), `appointments.dto.ts:19-25`, `sessions.controller.ts:12-15`.
7. BE English logs and internal reasons (21 log lines, 9 internal errors, reason codes at `refresh-session.use-case.ts:21-30`, `authenticate-device.use-case.ts:24-28`) and `clone-voice.synthesizer.ts:7,22-47` (anti-corruption mapping), Spanish comments in the 260 files (translate the 26 files that your branch touched first).
8. WEB attendance rate and period math: `analytics-summary.tsx:18-19`, `attendance-chart.tsx:11-12`, `center-home-screen.tsx:29-30` and ask the API for `rate` on every row (BE `dashboard.prisma.read-model.ts:216-379`).
9. WEB filter bar + specialties memo: `schedule-board.tsx:99-106,200-239` = `analytics-screen.tsx:60-67,91-127` (+ `center-patients-screen.tsx:23`); also `payment-history.tsx:27-49` = `payments-screen.tsx:38-68`.
10. WEB layering: `command-palette.tsx:8-9,45` (API in presentation), `audit.api.ts:16-30` (own fetch and retry), `usage-stories.ts:2-3` (application imports presentation), `errorMessage` imports in 53 presentation files, role layouts in `shared/presentation/layouts/*` importing modules.

Remove at the same time (small, safe): `next-therapy-card.tsx`, `endpoints.ts:59,66`, `globals.css:76`, 4 backend devDependencies (`package.json:62,84,87,89`), the two `src/scripts` files after confirming they ran in production.

## 6. Method notes and limits

- Clones: jscpd min-tokens 50 on `.ts`/`.tsx`; logic duplicated under different syntax found with targeted greps (time constants, `skipOf`, rate formula, `isAssigned`, `toISOString().slice`, `T00:00:00`) and then read at each site.
- Language: comments and string literals extracted with a small lexer (not regex over raw text); identifiers from the TypeScript AST (all Identifier nodes split into words and reviewed by eye against the full vocabulary: 1,112 distinct words in BE, 1,197 in WEB). Spanish detection for comments is heuristic (accents or Spanish function words); I spot-checked the four web hits and the module with the lowest counts.
- Dead code: knip@5 for unused files/exports/types/dependencies; custom scripts for CSS classes, keyframes, theme tokens, `routes`/`endpoints` keys, abstract port methods.
- Not covered: `test/`, `prisma/seed*.ts`, `docs/`, Dockerfiles. No runtime behaviour was tested.
