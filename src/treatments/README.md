# Módulo `treatments`

Sesiones prescritas por paciente y en qué va cada tratamiento. Las completadas salen de la agenda: nadie las digita a mano.

| Dato       | Valor                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Tabla      | `TreatmentPlan` (RLS por institución; se borra con el paciente)            |
| Depende de | `auth` (auditoría), `patients`, `profiles` (excepciones)                   |
| Pruebas    | [`test/clinical-agenda.e2e-spec.ts`](../../test/clinical-agenda.e2e-spec.ts) |

## Endpoints

| Método y ruta                                                   | Acceso               | Respuesta                                                                                            |
| --------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /treatment-progress?search&therapistId&specialty&status&page&limit` | `ADMIN`, `THERAPIST` | página con prescritas, completadas, agendadas, sin asistir, próxima cita, última sesión y minutos de práctica |
| `GET /patients/:id/treatment-plan`                              | `ADMIN`, `THERAPIST` | el plan, o cuerpo vacío si aún no tiene                                                               |
| `PUT /patients/:id/treatment-plan`                              | `THERAPIST`          | `{ prescribedSessions, notes? }`; solo un especialista asignado (`403 PatientNotAssigned`)            |

## Reglas

- El administrador ve el tablero por código (`name` es `null`); el especialista, solo sus pacientes y por nombre, diga lo que diga el filtro.
- Una página de pacientes y luego todas sus cifras de una vez: el trabajo no crece con el tamaño del centro.
- Toda prescripción queda en la auditoría (`TREATMENT_PLAN_CHANGE`) con el código del paciente.
