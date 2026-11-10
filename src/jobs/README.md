# Módulo `jobs`

Cola de documentos pesados: el PDF del reporte (spec 107 T007 y 108 T005) y el ZIP con la copia de los datos (spec 110 T003). Generarlos usa CPU durante segundos; dentro de una petición HTTP, Node no atendería a nadie más mientras tanto (tabletas sincronizando, "En vivo", inicios de sesión). Por eso la API **solo valida y encola**, y un **worker en otro proceso** genera de a un documento y lo deja en el bucket.

La **voz clonada** (spec 010) usa la misma cola en su propio carril: `VOICE_REGISTER` (registrar la muestra en el servicio de clonación) y `VOICE_CLIPS` (generar los audios del tablero). El worker corre un bucle por carril, así generar un tablero (minutos) no atrasa un PDF. Los trabajos de voz no dejan archivo (`downloadUrl` siempre `null`): los audios quedan en el tablero; los encola el módulo `voices` (`POST /patients/:id/voice` y `/voice/generate`, que devuelve `jobId`).

| Dato       | Valor                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Specs      | 107 T007, 108 T005, 110 T003                                                                                                  |
| Depende de | `profiles` (`PatientAccess`), `sessions` (`ReportPdfUseCase`), `data-requests` (`ExportPatientDataUseCase`), `common/storage` |
| Tabla      | `Job` (sin FK: guarda el código del paciente; al eliminarlo, spec 110 borra sus trabajos y archivos)                          |
| Proceso    | `src/worker.ts` (`pnpm start:worker` / `node dist/worker`); la API nunca arranca el worker                                    |
| Pruebas    | [`test/data-requests.e2e-spec.ts`](../../test/data-requests.e2e-spec.ts) (el worker se llama con `runOnce()`)                 |

## Endpoints (terapeuta; cada quien ve solo sus trabajos)

| Método y ruta                                 | Respuesta                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /patients/:id/reports/pdf-jobs?from&to` | `202` trabajo `REPORT_PDF` (`403 PatientNotAssigned`, `404 PatientNotFound`, `400` fechas)                                                 |
| `POST /patients/:id/export-jobs`              | `202` trabajo `EXPORT_ZIP`                                                                                                                 |
| `GET /jobs/:id`                               | `{ id, type, status, patientCode, params, position, attempts, error, fileName, createdAt, startedAt, finishedAt, expiresAt, downloadUrl }` |
| `GET /jobs?page&limit`                        | página de mis trabajos, del más nuevo al más viejo                                                                                         |
| `DELETE /jobs/:id`                            | cancela si sigue `QUEUED`; `409 JobNotCancelable` si ya empezó; `404 JobNotFound` si no es mío                                             |

Estados: `QUEUED → RUNNING → DONE | FAILED`, o `QUEUED → CANCELED`. `position` = cuántos van antes en la cola (solo `QUEUED`). `downloadUrl` = URL firmada del bucket por 5 min (la API reutiliza la misma mientras le quede al menos la mitad), solo en `DONE` y mientras el archivo exista.

## Reglas

| Regla                                                                                                               | Dónde                                    |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Se valida al encolar (asignación, fechas) para fallar al instante, no en la cola                                    | `JobsUseCases.enqueue`                   |
| Un pedido igual (persona, tipo, paciente, periodo) que no terminó devuelve el mismo trabajo (doble toque)           | `findActive`                             |
| Un documento a la vez por proceso; varios procesos se reparten la cola sin pisarse                                  | `claimNext` con `FOR UPDATE SKIP LOCKED` |
| El worker renueva su reserva cada 30 s; si se cae, a los 2 min otro retoma el trabajo                               | `lockedUntil`, `jobRules.leaseMs`        |
| Al correr se vuelve a comprobar la cuenta (activa) y la asignación (cada caso de uso)                               | `JobsWorker.process`                     |
| Error de negocio: `FAILED` con su mensaje, sin reintento; otro error: reintento a los 30 s, 1 y 2 min; al 3.º falla | `JobsWorker.failed`                      |
| La auditoría la hace cada caso de uso al generar (`REPORT_EXPORT`, `DATA_EXPORT`) con la IP de quien pidió          | `DocumentJobHandlers`                    |
| El archivo dura 24 h; la limpieza lo borra del bucket y el trabajo queda como historial                             | `JobsWorker.cleanup`                     |
| Si el paciente se elimina mientras se genera, el archivo no se guarda                                               | `complete` devuelve `false`              |

## Para agentes de IA

- Para un tipo nuevo: agregar el valor a `JobType` (y su migración), un caso en `QueueJobHandlers` y elegir su carril en `lanes` (`documentTypes` o `voiceTypes`, o uno nuevo).
- `ponytail:` la app consulta el estado cada 2,5 s; un aviso por el WebSocket del personal (`job.updated`) evitaría las consultas.
- `ponytail:` la cola en PostgreSQL alcanza para una o pocas instancias; con muchas, BullMQ + Redis (la tabla `Job` seguiría siendo la fuente de verdad, constitución §2).
