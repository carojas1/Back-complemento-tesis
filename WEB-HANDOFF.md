# Lista técnica para el backend: plataforma web de Necon

Qué cambió en la API para el portal web, qué debe revisar la app móvil y qué falta. Rama: `feat/web-platform-admin`. Todo es aditivo: ninguna ruta de la tableta se quitó, ningún campo pasó a ser obligatorio.

## Puesta en marcha

```bash
pnpm install
pnpm prisma migrate deploy
pnpm test
```

- Las e2e borran tablas: usan `DATABASE_URL_TEST`, o `DATABASE_URL` si la base es solo de pruebas. Se corren con `AWS_ENDPOINT_URL_S3=` vacío (bucket en memoria) y `TRUST_PROXY_HOPS=1`.
- `DATABASE_URL` debe ser la conexión **directa** de Neon (host sin `-pooler`): la RLS fija el rol y la institución en la sesión de PostgreSQL.
- Tres migraciones nuevas además de `20261029000000_platform_admin`: `20261101000000_session_institution_index`, `20261102000000_clinical_agenda` y `20261103000000_center_logo`. `20261102000000_clinical_agenda` instala `btree_gist`, que Neon permite. Hay que migrar **antes** de cambiar la API: sin ellas `POST /users`, los códigos de tableta y `/platform/institutions` responden 500. Córrelas fuera de horas pico: `CREATE INDEX` sobre `Session` bloquea escrituras mientras se construye.

## Esquema nuevo

| Tabla o columna | Para qué | RLS |
| --- | --- | --- |
| `CenterSettings.logoPath` (`TEXT`, opcional) | Logo de cada centro: solo el path en el bucket | ya la tenía |
| `User.specialty` (`VARCHAR(80)`, índice con `institutionId`) | Área del especialista; filtra agenda y métricas | ya la tenía |
| `Room` (`institutionId`, `name` único por centro, `active`) | Consultorios | completa dentro del centro |
| `CenterHours` (`institutionId`, `weekday`, `opensAt`, `closesAt`; minutos locales) | Horario; un día sin fila está cerrado | completa dentro del centro |
| `TreatmentPlan` (`patientId` PK, `prescribedSessions` 1–500, `notes`, `updatedBy`) | Sesiones prescritas | completa dentro del centro |
| `Subscription`, `SubscriptionPayment` | Plan anual | el centro solo lee; la plataforma escribe como dueña |
| `Appointment.roomId` (reemplaza a `room` de texto) + índices `(roomId, startsAt)`, `(institutionId, status, startsAt)` | Ocupación medible | ya la tenía |
| Restricciones `Appointment_{therapist,patient,room}_no_overlap` (`EXCLUDE USING gist` sobre `tsrange`, solo `SCHEDULED`) | Dos peticiones simultáneas nunca dejan dos citas cruzadas | — |

## Endpoints nuevos o cambiados

| Ruta | Acceso | Notas |
| --- | --- | --- |
| `GET /health` | público | `{ status, database }`; 503 si la base no responde en 3 s |
| `GET /limits` | `ADMIN` | `{ maxTherapists, maxDevices, activeTherapists, activeDevices }` |
| `GET,POST /appointments`, `GET,PATCH /appointments/:id`, `POST /appointments/:id/status` | `ADMIN`, `THERAPIST` | filtros `from,to,therapistId,patientId,status,specialty,roomId`; `roomId` en vez de `room` |
| `GET,POST /rooms`, `PATCH /rooms/:id` | leer `ADMIN`, `THERAPIST`; escribir `ADMIN` | |
| `GET,PUT /center-hours` | leer `ADMIN`, `THERAPIST`; escribir `ADMIN` | |
| `GET /treatment-progress` | `ADMIN`, `THERAPIST` | prescritas vs completadas, próxima cita, profesional; paginado |
| `GET,PUT /patients/:id/treatment-plan` | leer `ADMIN`, `THERAPIST`; escribir `THERAPIST` asignado | |
| `GET /dashboard`, `GET /dashboard/analytics` | `ADMIN`; analytics también `THERAPIST` (solo lo suyo) | asistencia, ocupación, pacientes atendidos, práctica por semana |
| `GET /notifications`, `/unread-count`, `POST /:id/read`, `/read-all` | `SUPER_ADMIN`, `ADMIN` | |
| `POST /platform/requests/:id/review`, `PATCH /platform/requests/:id/notes` | `SUPER_ADMIN` | estado `IN_REVIEW` |
| `POST /platform/requests/:id/approve`, `POST /platform/institutions/:id/admins` | `SUPER_ADMIN` | devuelven `temporaryPassword` una vez |
| `GET,PATCH /platform/institutions/:id`, `POST .../status` | `SUPER_ADMIN` | límites, suspensión |
| `GET,PATCH /platform/institutions/:id/subscription`, `POST .../cancel`, `GET,POST .../payments`, `GET /platform/payments` | `SUPER_ADMIN` | plan anual, 2,00 USD por defecto |
| `POST /platform/institutions/:id/subscription/reactivate` | `SUPER_ADMIN` | restablece un plan cancelado |
| `GET /subscription`, `GET /subscription/payments` | `ADMIN` | su propio plan, solo lectura |
| `GET /patients/:id/reports` | sin cambios para la tableta | agrega `practiceByWeek` |
| `POST /patients/:id/reports/pdf-jobs` | sin cambios en la ruta | el PDF ahora es el historial clínico completo (plan, práctica, citas, sesiones, notas, objetivos) |
| `POST,PATCH /users` | `ADMIN` | aceptan `specialty` opcional |
| `PUT,DELETE /settings/logo` | `ADMIN` | multipart `logo`: PNG o JPG verificados por sus bytes, hasta 500 KB y 2048 px por lado; SVG rechazado; 10 por minuto; auditado |
| `GET /audit/xlsx`, `GET /audit/pdf` | `ADMIN` | mismo filtro que `GET /audit`; Excel hasta 50 000 registros y PDF hasta 2000; auditado con su formato; 10 por minuto |
| `GET /settings/branding` | `ADMIN`, `THERAPIST` | `{ centerName, logoUrl? }` con URL firmada; `GET /devices/settings` no cambia |

Agregado el 4 de noviembre: `GET /patients/:id/administrative` (solo administrador, auditado, sin datos clínicos): fecha de nacimiento, representante, consentimiento, alta, fecha de registro y tabletas que usó el paciente. Lo usa la ficha del paciente del portal.

## Comportamientos corregidos

- **Tabletas de un centro suspendido:** ahora reciben `403 InstitutionSuspended`, no 401. Con 401 la app borraba su token y no podía volver al reactivarse.
- **Rotación de sesión:** una carrera dentro de 30 s ya no borra la cookie que acaba de ganar la otra pestaña.
- **Citas dobles:** garantizado en la base, no solo con la validación previa.
- **Límites:** el de tabletas también se verifica al canjear el código (antes, varios códigos podían pasarlo) y el de especialistas al reactivar una cuenta.
- **Correo:** nunca retiene una petición (timeouts de 5 a 10 s y sin `await` en solicitud y aprobación); la app corta a los 15 s y perdía la clave temporal.
- **Citas huérfanas:** dar de alta a un paciente o desactivar a un especialista cancela sus citas futuras. Editar solo las notas ya no revalida la asignación.
- **`null` explícito:** en campos no anulables responde 400 en vez de 500.
- **Paneles:** una tableta recién registrada no cuenta como sin conexión, el paciente técnico anónimo no cuenta como dado de alta, y «hoy» es el día de Ecuador. Renombrar un centro también cambia el nombre en sus paneles y PDF.

## Qué debe revisar la app móvil

No se rompe ningún flujo: revisamos cada llamada de la app contra esta rama. Quedan estos ajustes de su lado:

1. **`IN_REVIEW`** (agregar): una solicitud en ese estado desaparece de la app, que no tiene pestaña para él. Archivos: `src/types/institutions.ts:2`, `src/strings/institutions.ts:67-68`, `src/screens/panel/platform-screen.tsx:19-20,79`. Mientras tanto, esas solicitudes se terminan desde la web.
2. **`403 InstitutionSuspended`** (opcional): hoy se ve como error genérico. Conviene un mensaje claro; no hay que borrar el token.
3. **`409 LimitReached`** al canjear un código en `POST /devices/register` (nuevo): el mensaje ya viene en español.

**No se debe cambiar:** el contrato de firma de tableta (`METHOD\npath?query\ntimestamp`), el significado de 401 en tableta (borrar token), `refreshToken` en el cuerpo con `X-App-Key`, `items,page,limit,total,totalPages`, `limit` ≤ 100, los campos de `/sync/profiles` y `/devices/settings`, `privacyNoticeVersion` (va junto con la app) y los nombres multipart `consentImage`, `image`, `audio`, `sample`.

## Pendiente de implementar

| Prioridad | Tarea | Dónde |
| --- | --- | --- |
| Alta | Migrar la base en vivo `neondb`, con copia antes: sigue atrasada. Las pruebas del portal se hicieron en `mediconnect_test`, ya con todas las migraciones. Rotar la contraseña de la base y las claves S3, que circularon por chat | Consola de Neon, `.env` |
| Alta | Bajar el tiempo de `GET /patients/:id/profile`: tardó de 1 a 8,5 s sobre Neon, con unos 120 ms por consulta desde Cuenca | `profiles`, región de Neon |
| Media | Sincronización en vivo hacia la web: el WebSocket `/ws` ya existe, pero la web hoy refresca cada 15–60 s porque el proxy de Next no reenvía WebSocket. Publicar `/ws` en nginx y conectarlo desde la web | `caa-web/deploy/nginx.conf`, `src/sync` |
| Media | Sincronización de la web a la tableta: los cambios del tablero ya llegan en la siguiente sincronización. Empujarlos por `/ws` si se quiere al instante | `src/profiles`, `src/sync` |
| Media | Carrera de límites: crear dos cuentas a la vez puede pasar el límite por una. `pg_advisory_xact_lock` por institución en la transacción de alta | `create-account.use-case.ts` |
| Media | Caché corta para `GET /platform/dashboard`: agrupa `Session` de todos los centros en cada carga | `institutions.prisma.repository.ts` |
| Media | Incluir las citas en el ZIP de exportación de datos del paciente, si LOPDP lo exige | `export-patient-data.use-case.ts` |
| Media | `GET /jobs` siempre devuelve `position: null` y no filtra por paciente: la web consulta cada trabajo activo por separado cada 2,5 s. Devolver la posición y aceptar `patientId` | `src/jobs` |
| Media | Agregar `patientId` a `GET /live/patients`, `GET /data-requests` y `GET /treatment-progress`, y orden por vencimiento en `GET /data-requests`: hoy la web filtra en el cliente | `src/sync`, `src/data-requests`, `src/treatments` |
| Media | `GET /users` no tiene búsqueda; `GET /users/:id/patients` llega a 100 y `PUT` reemplaza toda la lista, así que un especialista con más de 100 pacientes perdería el resto al guardar | `src/users` |
| Media | Solicitudes de acceso: solo se cierran al generar la exportación. `oldestOpenRequests` se corta en 5 y mezcla `PENDING` con `IN_REVIEW`, lo que puede esconder una solicitud nueva | `src/data-requests`, `src/institutions` |
| Baja | `GET /platform/institutions` sin `planStatus` (la web lo cruza con el panel), `GET /platform/payments` sin filtros y con `recordedBy` sin nombre | `src/institutions`, `src/subscriptions` |
| Baja | No hay forma de quitar un diagnóstico con `PATCH /patients/:id`; `PUT treatment-plan` borra las notas si no se envían (la web las reenvía) | `src/patients`, `src/treatments` |
| Baja | No hay ruta para que el centro edite su dirección, teléfono o correo: solo el super administrador | `src/settings`, `src/institutions` |
| Baja | Evitar abuso de correo en `POST /institution-requests`: el texto lo elige quien envía y el límite es solo por IP. Quitar `institutionName` del correo de confirmación o limitar por correo | `auth.mailer.ts` |
| Baja | Bloqueo de inicio de sesión: 5 intentos fallidos bloquean el correo 15 min desde cualquier IP, lo que permite bloquear a alguien a propósito. Clave por correo e IP debilita la defensa contra ataques distribuidos; decidir entre eso o una espera creciente | `login.use-case.ts`, `login-attempt.entity.ts` |
| Media | Rechazar en la API cerrar como asistida o no asistida una cita que no ha empezado: el portal ya no lo ofrece, la API todavía lo acepta | `appointment.entity.ts` |
| Baja | Decidir si se permite agendar en el pasado. Hoy se permite | `appointment.entity.ts` |
| Baja | Dos pruebas de `uploads` fallan en máquinas con antivirus que inspecciona HTTP local (Avast): envían a propósito un archivo malicioso. Correrlas en CI | `test/uploads.e2e-spec.ts` |

## Uso por paciente y de la app

Rutas nuevas de solo lectura, sin migración y sin cambios para la tableta:

- `GET /dashboard/patients` (`ADMIN`, `THERAPIST`): página de pacientes activos con asistencia, sesiones, minutos, última sesión y próxima cita.
  El administrador recibe el mismo código, nombre y avatar de `GET /patients`, más conteos. Los aciertos (`correctRate`) son solo para el
  especialista asignado.
- `GET /dashboard/usage` (`ADMIN`, `THERAPIST`): sesiones, tiempo, horarios y totales de uso. `devices` solo para el administrador.

Decisión para revisar juntos: `src/dashboard/README.md` decía que el administrador nunca ve el nombre ni el código de un paciente en este módulo. El portal, además, le muestra el nombre en agenda, pacientes y equipo usando `GET /patients`.
La ruta nueva sí los muestra, porque ya los tiene en `GET /patients`, y sigue sin diagnóstico, notas, palabras ni aciertos.


## Audit of November 2026

Findings, fixes and what remains for this team are in [`docs/audit-2026-11/README.md`](docs/audit-2026-11/README.md). New migration: `20261104000000_lockout_and_query_indexes`.
`TRUST_PROXY_HOPS` must count the portal when it proxies the API (for example 1 on Vercel), or every user shares one rate limit.
