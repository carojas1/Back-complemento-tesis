# Módulo family (spec 112)

El modo familia del representante (`PARENT`): solo lectura de sus hijos y la práctica en casa. Todo pasa por el vínculo `GuardianPatient`; un paciente ajeno es `403 PatientNotLinked`.

| Ruta                                        | Qué devuelve                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /family/patients`                      | Hijos (paginado): `{ id, code, firstNames, lastNames, avatarUrl }`                        |
| `GET /family/patients/:id`                  | Información básica: nacimiento, estado, diagnóstico y terapeutas (auditado `FAMILY_READ`) |
| `GET /family/patients/:id/profile`          | El tablero, igual que `/sync/profiles`                                                    |
| `GET /family/patients/:id/sessions?from&to` | Sesiones de terapia y práctica en casa (`kind`)                                           |
| `GET /family/patients/:id/notes`            | Solo observaciones con `sharedWithFamily`                                                 |
| `GET /family/patients/:id/homework?status`  | Deberes (vista del módulo `homework`)                                                     |
| `POST /family/homework/:id/complete`        | Deber hecho (idempotente, auditado)                                                       |
| `POST /family/practice`                     | Práctica en casa (auditado `HOME_PRACTICE`)                                               |

## Práctica en casa

`POST /family/practice` usa `ProcessBatchUseCase` de `sync` con el origen `{ guardianId }`: solo sesiones de sus hijos (si no, `UnknownPatientCode`), guardadas como `kind: HOME`, sin tableta ni terapeuta; un `homeworkId` de otro paciente se ignora; eventos y respuestas solo se agregan a su propia práctica (nunca a una sesión de terapia); no sale en el panel en vivo. "Más usados" sí cuenta los toques de casa.

Pruebas: `test/family.e2e-spec.ts`.
