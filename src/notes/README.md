# Módulo `notes`

Observaciones y objetivos del paciente (spec 108), de las terapeutas asignadas.

| Dato    | Valor                                                                                         |
| ------- | --------------------------------------------------------------------------------------------- |
| Spec    | [108 — Observaciones y objetivos](../../../caa-spec-driven-development-SDD-/specs/108-observaciones/spec.md) |
| Tablas  | `Note`, `Goal`                                                                                |
| Pruebas | [`test/sessions.e2e-spec.ts`](../../test/sessions.e2e-spec.ts)                                |

## Endpoints

| Método y ruta                                                      | Quién                     | Qué hace                                              |
| ------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------- |
| `GET /patients/:id/notes?from&to&page`                             | asignada                  | en orden cronológico, con autora y `editable`         |
| `POST /patients/:id/notes` `{ text, sessionId? }`                  | asignada                  | nueva observación (máx. 2000 caracteres)              |
| `PATCH /notes/:id` `{ text }`                                      | su autora, dentro de 24 h | edita; la versión anterior va a la auditoría (FR-001) |
| `GET /patients/:id/goals` · `POST …/goals` `{ text, targetDate? }` | asignada                  | objetivos; nacen `IN_PROGRESS`                        |
| `PATCH /goals/:id` `{ status?, text?, targetDate? }`               | cualquier asignada        | `ACHIEVED`, `SUSPENDED` o de vuelta a `IN_PROGRESS`   |

Las observaciones no se borran. Crear y editar se audita (`NOTE_*`, `GOAL_*`) con el código del paciente.
