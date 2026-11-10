# Módulo homework (spec 112)

Deberes de repaso en casa. Los manda una terapeuta asignada al paciente; el representante los ve y los marca hechos desde el módulo `family`.

| Ruta                                                                                    | Rol                | Notas                                                                             |
| --------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `GET /patients/:id/homework?status=pending\|done`                                       | THERAPIST asignada | Paginado, del más nuevo al más antiguo                                            |
| `POST /patients/:id/homework` `{ instructions, pictogramIds, dueDate?, withActivity? }` | THERAPIST asignada | 1 a 12 pictogramas **del tablero del paciente** (`400 InvalidHomeworkPictograms`) |
| `PATCH /homework/:id` · `DELETE /homework/:id`                                          | THERAPIST asignada | `409 HomeworkDone` si ya está hecho                                               |

Vista: `{ id, instructions, dueDate, withActivity, pictograms: [{ pictogramId, label, imageUrl }], author, createdAt, completedAt, completedBy, practice: { sessions, lastAt, correct, total } }`. `practice` sale de las sesiones `HOME` con ese `homeworkId` y sus respuestas de la actividad.

## Reglas

- La entidad `Homework` valida 1 a 12 pictogramas sin repetir; no se cambia ni borra una vez hecha; `complete()` es idempotente.
- Auditoría: `HOMEWORK_CREATE`, `HOMEWORK_UPDATE`, `HOMEWORK_DELETE` (y `HOMEWORK_COMPLETE` desde `family`), con el código del paciente.
- Exporta `HomeworkRepository` para el modo familia.
