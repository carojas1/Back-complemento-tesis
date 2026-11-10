# Módulo `data-requests`

Derechos del representante legal sobre los datos del paciente (LOPDP): **acceso** (copia en ZIP), **rectificación** (corrección con motivo) y **eliminación** (con doble confirmación del administrador). Cada solicitud queda registrada con tipo, fecha de pedido, fecha de respuesta y responsable, y sobrevive a la eliminación del paciente porque guarda el código, no una FK (FR-001).

| Dato       | Valor                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Spec       | [110 — Derechos sobre los datos](../../../caa-spec-driven-development-SDD-/specs/110-derechos-datos/spec.md) (T003, T004, T006)                       |
| Depende de | `auth` (enlaces de descarga, auditoría), `profiles` (`PatientAccess`), `sessions` (`ReportPdfUseCase`), `settings` (nombre del Centro) |
| Tablas     | `DataRequest`, `RetiredPatientCode`, `GlobalSyncVersion`; borra `Patient` y lo que cuelga de él                                        |
| Pruebas    | [`test/data-requests.e2e-spec.ts`](../../test/data-requests.e2e-spec.ts)                                                               |

## Endpoints

| Método y ruta                                                                 | Quién                                            | Respuesta                                                                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /patients/:id/data-requests` `{ type, notes?, statisticalUseAllowed? }` | terapeuta asignada                               | `201` solicitud `OPEN` / `403 PatientNotAssigned` / `404 PatientNotFound` / `400 ValidationError`                          |
| `GET /data-requests?status&type&page&limit`                                   | admin (todas) y terapeuta (las de sus pacientes) | página de solicitudes, de la más nueva a la más vieja                                                                      |
| `POST /patients/:id/export-jobs` (módulo `jobs`)                              | terapeuta asignada                               | `202` trabajo en cola; el worker genera el ZIP con `ExportPatientDataUseCase` y atiende las solicitudes de acceso abiertas |
| `POST /data-requests/:id/complete` `{ notes }`                                | terapeuta asignada                               | `200` rectificación `DONE` / `409 DataRequestWrongType` / `409 DataRequestClosed`                                          |
| `POST /data-requests/:id/reject` `{ notes }`                                  | admin                                            | `200` `REJECTED` / `409 DataRequestClosed` / `404 DataRequestNotFound`                                                     |
| `POST /data-requests/:id/execute-deletion` `{ confirmCode }`                  | admin                                            | `200` `DONE` (`patientId: null`) / `400 ConfirmCodeMismatch` / `409 DataRequestWrongType` / `409 …Closed`                  |

Cada solicitud se devuelve como `{ id, patientCode, patientId, type, status, requestedAt, dueAt, deadline, respondedAt, handledBy, handledByName, notes, statisticalUseAllowed }`. Nunca lleva el nombre del paciente; `patientId` es `null` si ya se eliminó. `deadline` (FR-002): `OVERDUE` (pasó `dueAt` = pedido + 15 días), `DUE_SOON` (faltan 3 días o menos), `ON_TIME`, o `null` si ya se atendió.

## Reglas de negocio

| Regla                                                                                                                                                                      | Dónde se cumple                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Plazo de 15 días; por vencer a 3 días o menos                                                                                                                              | `DataRequest.dueAt()` / `deadline()`                               |
| `statisticalUseAllowed` solo en `DELETION` (por defecto `false`); en los demás tipos es `null`                                                                             | `DataRequest.create`                                               |
| Solo se atiende una solicitud abierta y del tipo de la acción                                                                                                              | `DataRequest.assertOpen`                                           |
| Rectificación: se corrige con `PATCH /patients/:id` (audita `PATIENT_UPDATE`) y se cierra con el motivo; la respuesta se agrega a `notes` como `Respuesta: …`              | `CompleteRectificationUseCase`, `DataRequest.close`                |
| Acceso: el ZIP lleva `ficha.pdf`, `reporte.pdf` (toda la historia), `observaciones.csv`, `objetivos.csv`, `sesiones.csv`, `eventos.csv`, `actividades.csv` (UTF-8 con BOM) | `ZipExportArchive`                                                 |
| Eliminación: `confirmCode` igual al código del paciente (sin distinguir mayúsculas)                                                                                        | `ExecuteDeletionUseCase` → `ConfirmCodeMismatch`                   |
| Una transacción: borra el `Patient` (y en cascada asignaciones, condiciones, perfil, voz, observaciones y objetivos), sube `GlobalSyncVersion` y crea `RetiredPatientCode` | `PatientEraserPrisma`                                              |
| Con uso estadístico, las sesiones (con eventos y resultados) pasan al paciente técnico `ANONIMO`, sin terapeuta; sin él, se borran                                         | `PatientEraserPrisma`                                              |
| Consentimiento, grabaciones, muestra y audios de la voz se borran del bucket **después** de la transacción; un fallo queda en el log y en la auditoría                     | `ExecuteDeletionUseCase`                                           |
| La tableta quita el perfil: `GET /sync/profiles` entrega el código en `retiredPatientCodes` y en `dischargedPatientCodes`                                                  | `sync` (`GetSyncProfilesUseCase`)                                  |
| El paciente `ANONIMO` está dado de alta desde 1970: no baja a tabletas, no acepta sesiones nuevas, no se lista ni admite solicitudes                                       | `PatientEraserPrisma`, `patients` (`list`), `PatientRecordsPrisma` |

## Auditoría (T006)

`DATA_REQUEST_CREATE`, `DATA_EXPORT` (archivos y solicitudes atendidas), `DATA_REQUEST_RECTIFY`, `DATA_REQUEST_REJECT` (entidad `DataRequest`) y `DATA_DELETION` (entidad `Patient`: anonimizado o no, sesiones y archivos). La exportación también deja el `REPORT_EXPORT` del PDF del reporte. Todo con el código del paciente; la auditoría no se borra con él.

## Estructura

```
data-requests/
├── data-requests.module.ts
├── domain/
│   ├── entities/data-request.entity.ts      DataRequest (plazo, assertOpen, complete, reject) + anonymousPatientCode
│   ├── exceptions/data-requests.exceptions.ts
│   └── ports/data-requests.repository.ts    DataRequestsRepository, PatientRecords, PatientEraser, ExportArchive
├── application/                             un caso de uso por acción
│   ├── create-data-request · list-data-requests · complete-rectification · reject-data-request
│   ├── export-patient-data (lo usa la cola) · execute-deletion
│   └── data-request-actor (búsqueda, asignación y auditoría comunes) · data-request-view
└── infrastructure/
    ├── http/                                controller + DTO
    ├── prisma/                              solicitudes, lectura del paciente, eliminación transaccional
    └── export/zip-export.archive.ts         jszip + ficha con pdfmake + CSV
```

## Para agentes de IA

- ⚑ Spec 110 FR-003 / T001: validar con el asesor legal la anonimización y los plazos antes de usar la eliminación en producción.
- La auditoría es solo de inserción: los resúmenes antiguos (p. ej. `NOTE_UPDATE.previous`) siguen guardando texto clínico del paciente eliminado. Decidirlo con el asesor legal.
- La foto del consentimiento no va en el ZIP (la API la descifra con `GET /patients/:id/consent`).
- No pongas FK de `DataRequest` a `Patient`: rompería FR-001.
