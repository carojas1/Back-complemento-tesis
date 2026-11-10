# Módulo `center`

Consultorios y horario de atención de cada centro. El administrador los configura; el especialista los lee para agendar; la agenda los hace cumplir y las métricas miden la ocupación.

| Dato       | Valor                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Tablas     | `Room`, `CenterHours` (RLS por institución)                                |
| Depende de | `auth` (auditoría)                                                         |
| Pruebas    | [`test/clinical-agenda.e2e-spec.ts`](../../test/clinical-agenda.e2e-spec.ts) |

## Endpoints

| Método y ruta       | Acceso               | Respuesta                                                     |
| ------------------- | -------------------- | ------------------------------------------------------------- |
| `GET /rooms?active` | `ADMIN`, `THERAPIST` | página de consultorios                                        |
| `POST /rooms`       | `ADMIN`              | `{ name }` / `409 RoomNameTaken`                              |
| `PATCH /rooms/:id`  | `ADMIN`              | `{ name?, active? }`; se desactiva, nunca se borra            |
| `GET /center-hours` | `ADMIN`, `THERAPIST` | `[{ weekday, opensAt, closesAt }]`, en minutos del día local  |
| `PUT /center-hours` | `ADMIN`              | `{ hours }`: toda la semana; un día que no aparece está cerrado |

## Reglas

- Sin horario configurado, la agenda acepta cualquier hora. Con horario, una cita fuera de él responde `400 OutsideCenterHours`.
- `weekday` 0 es domingo. Las horas son del centro (hora de Ecuador, UTC-5).
- Un consultorio ocupado responde `409 RoomUnavailable`; una restricción de exclusión en la base lo garantiza aunque lleguen dos peticiones a la vez.
