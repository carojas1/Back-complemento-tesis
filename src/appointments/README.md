# Módulo `appointments`

Agenda de terapias de cada centro: la pantalla de citas generales. El administrador agenda, mueve y cierra las citas de
todas las terapeutas; cada terapeuta maneja su propia agenda (agenda, mueve y cierra las suyas). Los dos paneles muestran
los mismos datos.

| Dato       | Valor                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Tabla      | `Appointment` (RLS por institución, `CHECK endsAt > startsAt`)             |
| Depende de | `auth` (auditoría), `profiles` (`PatientNotAssigned`)                      |
| Pruebas    | [`test/platform-admin.e2e-spec.ts`](../../test/platform-admin.e2e-spec.ts) |

## Endpoints

| Método y ruta                                            | Acceso               | Respuesta                                                             |
| -------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `GET /appointments?from&to&therapistId&patientId&status` | `ADMIN`, `THERAPIST` | página por hora de inicio; la terapeuta siempre recibe solo las suyas |
| `GET /appointments/:id`                                  | `ADMIN`, `THERAPIST` | una cita / `403 NotYourAppointment`                                   |
| `POST /appointments`                                     | `ADMIN`, `THERAPIST` | `{ patientId, therapistId?, startsAt, endsAt, room?, notes? }`        |
| `PATCH /appointments/:id`                                | `ADMIN`, `THERAPIST` | mueve, reasigna o edita / `409 AppointmentClosed`                     |
| `POST /appointments/:id/status`                          | `ADMIN`, `THERAPIST` | `{ status }`: `COMPLETED`, `CANCELED` o `NO_SHOW`                     |

## Reglas

- Entre 10 minutos y 8 horas (`400 InvalidAppointmentPeriod`).
- La terapeuta debe estar activa y el paciente activo y **asignado a esa terapeuta** (spec 102).
- Sin cruces entre citas `SCHEDULED` de la misma terapeuta (`409 TherapistUnavailable`) o del mismo paciente
  (`409 PatientUnavailable`). Una cita tras otra sí se puede.
- Una cita cerrada no se reabre: se agenda una nueva.
- **La terapeuta** agenda solo para sí misma (sin `therapistId` se toma la suya), mueve y cierra solo sus citas y no las
  pasa a otra terapeuta: `403 NotYourAppointment`. Un paciente que no tiene asignado le responde `403 PatientNotAssigned`,
  como en el resto de la API. Al administrador, `therapistId` es obligatorio y un paciente sin asignar responde
  `400 PatientNotAssignedToTherapist`.
- La agenda muestra al paciente **solo por código y avatar**: se puede ver en una pantalla de recepción. `notes` es
  logística; las notas clínicas van en las observaciones (spec 108).
- Todo cambio queda en la auditoría (`APPOINTMENT_CREATE`, `APPOINTMENT_UPDATE`, `APPOINTMENT_STATUS`) con el código del
  paciente.

## Estructura

```
appointments/
  appointments.module.ts
  domain/entities/appointment.entity.ts                Appointment, AppointmentStatus, ClosingStatus
  domain/exceptions/appointments.exceptions.ts
  domain/ports/appointments.repository.ts
  application/appointment-rules.ts                     assertOwnAppointment, assertBookable, auditAppointment
  application/list-appointments.use-case.ts
  application/get-appointment.use-case.ts
  application/book-appointment.use-case.ts
  application/reschedule-appointment.use-case.ts
  application/close-appointment.use-case.ts
  infrastructure/http/appointments.controller.ts
  infrastructure/http/appointments.dto.ts
  infrastructure/prisma/appointments.prisma.repository.ts
```
