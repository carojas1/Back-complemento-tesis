# Módulo `dashboard`

Inicio del administrador del centro: solo conteos, nunca datos clínicos (spec 102). El inicio del super administrador
vive en `institutions` (`GET /platform/dashboard`) porque lee tablas de la plataforma.

| Dato       | Valor                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablas     | lee `CenterSettings`, `User`, `Patient`, `TherapistPatient`, `Device`, `Appointment`, `Session` y `DataRequest` bajo RLS (sin tabla propia) |
| Depende de | `prisma`                                                                                                                                    |
| Pruebas    | [`test/platform-admin.e2e-spec.ts`](../../test/platform-admin.e2e-spec.ts)                                                                  |

## Endpoints

| Método y ruta             | Acceso  | Respuesta                                                                                                                                                                                                                                                  |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /dashboard?dayStart` | `ADMIN` | nombre del centro, terapeutas, representantes, pacientes, tabletas (sin sincronizar en 7 días), citas de hoy y de los próximos 7 días, solicitudes de datos abiertas, sesiones de terapia en 30 días, asistencia, carga, seguimiento y sesiones por semana |

- `GET /dashboard/patients?page&limit&from&to&therapistId&search&flag&sort` (`ADMIN`, `THERAPIST`): página de pacientes activos con
  asistencia, sesiones, minutos en terapia y en casa, última sesión y próxima cita. `counts` dice cuántos deja cada `flag`
  (`NO_PRACTICE`, `NO_SHOWS`). El especialista ve solo a sus asignados y además `correctRate` (aciertos al primer intento).
- `GET /dashboard/usage?from&to&therapistId` (`ADMIN`, `THERAPIST`): sesiones, minutos, días con uso, pacientes que practicaron, por
  día y por hora, pictogramas tocados y frases dichas, comparado con el periodo anterior. `devices` solo para el administrador.

`dayStart` es la medianoche local del navegador (medianoche UTC si falta), para que «hoy» sea el día del administrador.
Es un modelo de lectura (`DashboardReadModel`) bajo RLS: cada conteo queda dentro del centro de la petición.

## Qué ve el administrador

En `GET /dashboard/patients` ve el mismo código, nombre y avatar que ya le da `GET /patients`, más conteos de uso y de agenda: nunca
el diagnóstico, las notas, las palabras ni los aciertos. El resto del módulo sigue siendo solo conteos:

Lo arma con las sesiones que sincronizan las tabletas y con la agenda. Solo conteos y nombres de terapeutas: nunca el
nombre, el código ni datos clínicos de un paciente. Una sesión es una sesión `THERAPY` (la práctica en casa, `HOME`, no
cuenta).

```ts
interface CenterOverview {
  centerName: string;
  therapists: { active: number; inactive: number };
  parents: number;
  patients: { active: number; discharged: number };
  devices: { active: number; stale: number; revoked: number };
  appointmentsToday: { scheduled: number; completed: number; canceled: number; noShow: number };
  appointmentsNext7Days: number;
  openDataRequests: number;
  sessionsLast30Days: number;
  attendance: { completed: number; noShow: number; canceled: number };
  therapistLoad: { therapistId: string; name: string; activePatients: number; sessionsLast30Days: number; appointmentsNext7Days: number }[];
  followUp: { patientsWithoutTherapist: number; patientsWithoutSessionIn30Days: number };
  sessionsByWeek: { weekStart: string; sessions: number }[];
}
```

| Campo            | Significado                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attendance`     | citas que empezaron en los últimos 30 días, por estado final (las `SCHEDULED` quedan fuera)                                                                                                                                  |
| `therapistLoad`  | cada terapeuta **activa**, por nombre: pacientes activos asignados, sus sesiones de terapia en 30 días y sus citas `SCHEDULED` de los próximos 7 días (la misma ventana que `appointmentsNext7Days`: desde mañana)           |
| `followUp`       | pacientes activos sin ninguna terapeuta asignada, y pacientes activos sin sesión de terapia en 30 días                                                                                                                       |
| `sessionsByWeek` | las últimas 8 semanas, de la más vieja a la actual, incluidas las semanas en 0. La semana empieza el lunes en hora de Ecuador (UTC-5, sin horario de verano, como en `src/sync`); `weekStart` es ese lunes como `YYYY-MM-DD` |
