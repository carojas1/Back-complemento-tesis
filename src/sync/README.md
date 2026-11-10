# Módulo `sync`

Lo que viaja entre la tableta y la plataforma, **en los dos sentidos**:

- **Bajada:** perfiles de los pacientes cambiados desde la última versión que tiene la tableta.
- **Subida:** sesiones, eventos y resultados de actividades que la tableta guardó sin red, por lotes (HTTP) o en vivo (WebSocket).

| Dato       | Valor                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Spec       | [106 — API de sincronización](../../../caa-spec-driven-development-SDD-/specs/106-api-sincronizacion/spec.md), 004, 008  |
| Depende de | `devices` (`@DeviceAuth`, `AuthenticateDeviceUseCase`), `auth` (JWT para el personal), `profiles`         |
| Tablas     | `Session`, `Event`, `ActivityRun`, `ActivityResult`, `GlobalSyncVersion`, `AuditLog` (`THERAPIST_PIN_OK`) |
| Pruebas    | [`test/sync.e2e-spec.ts`](../../test/sync.e2e-spec.ts) (incluye el WebSocket y la presencia)              |

## Endpoints de la tableta (`@DeviceAuth`)

| Método y ruta                         | Qué hace                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /sync/profiles?since&page&limit` | perfiles de pacientes **activos** cambiados después de `since` + `dischargedPatientCodes` (dados de alta **y** eliminados) + `retiredPatientCodes` (solo eliminados, spec 110) + `version` |
| `POST /sync/batch`                    | `{ sessions, events, activityRuns, activityResults }`, máximo 100 registros (si no, `413`)                                                                                                 |

## WebSocket `/ws`

| Quién     | Cómo se conecta                                             | Mensajes                                                             |
| --------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Tableta   | cabeceras de `@DeviceAuth` (firma de `GET\n/ws\ntimestamp`) | manda `{ type: 'batch', … }` → recibe `ack` tras guardar en Postgres |
| Terapeuta | `?token=<JWT>`                                              | manda `{ type: 'watch', patientId }` → recibe los eventos en vivo    |

Sin autorización se cierra con el código `4401`. Responde `ready`, `ack` o `error`.

## Panel en vivo para la web (FR-005 y FR-006)

| Qué                     | Cómo                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Estado de cada paciente | `ONLINE` (sesión abierta + tableta conectada + actividad en 5 min), `AWAY` (sesión abierta, tableta desconectada o 5 min sin eventos), `OFFLINE` (sin sesión abierta) — `domain/live.ts`   |
| Carga inicial           | `GET /live/patients?page&limit` (terapeuta: asignados; admin: todos los activos), con código, avatar, estado y sesión; sin nombres                                                         |
| Cambios en vivo         | WebSocket con `?token=<JWT>` → `{ type: 'presence' }` → lista y luego `{ type: 'status', … }` en cada cambio                                                                               |
| Ver una sesión          | `{ type: 'watch', patientId }` (solo terapeuta asignada, auditado `LIVE_WATCH`) → `watching` con lo ya ocurrido; después `events`, `results` y `status` en cuanto se guardan en PostgreSQL |

## Reglas de negocio

| Regla                                                                                                                                                 | Dónde se cumple                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Subir dos veces lo mismo no duplica (los IDs los genera la tableta; `createMany skipDuplicates`)                                                      | `SyncPrismaRepository`           |
| El paciente se busca por código; uno dado de alta solo acepta sesiones empezadas antes del alta                                                       | `process-batch.use-case.ts`      |
| `therapistVerified` solo se acepta si hay un `THERAPIST_PIN_OK` de esa tableta y terapeuta en las 12 h previas                                        | `process-batch.use-case.ts`      |
| Eventos y corridas necesitan una sesión conocida (del lote o ya guardada)                                                                             | `process-batch.use-case.ts`      |
| El `ack` se manda después de escribir en Postgres: si la tableta no lo recibe, reenvía el lote                                                        | `live.gateway.ts`                |
| Con toques de pictogramas, recalcula su uso desde los eventos (no suma: un lote repetido o atrasado no cuenta dos veces; lee solo los eventos de las sesiones de esos pacientes, por índice) y sube la versión del perfil | `refreshUsage` (spec 105 FR-008) |

## Para agentes de IA

- `ponytail:` el canal en vivo vive en memoria (`InMemoryLiveFeed`): con más de una instancia de la API hace falta Redis pub/sub.
- `pg` avisa `client.query() when the client is already executing a query` con el adaptador de Prisma: es un aviso de la librería, no un error de este módulo.
