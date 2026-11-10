# Necon API

API de la plataforma web de Necon (NestJS 11 + Prisma 7 + PostgreSQL). Arquitectura hexagonal: cada módulo separa `domain/` (puro), `application/` (un caso de uso por acción) e `infrastructure/` (Prisma, argon2, JWT, correo).

Implementado: **spec 101** (inicio de sesión web y roles, con clave temporal de cambio obligatorio), **spec 102** (gestión de usuarios) **spec 103** (tabletas: registro con código y PIN del Centro, token de dispositivo, firma con llave del Keystore, `X-App-Key` y configuración del Centro) y el **catálogo de vocabulario de la spec 105** (categorías y pictogramas de ARASAAC con imágenes en el bucket de Neon). El esquema de base de datos cubre las specs 101–110. No hay autorregistro: las cuentas las crea el administrador.

Cada módulo tiene su `README.md` con reglas, archivos, flujos e instrucciones para agentes de IA: [`src/auth`](src/auth/README.md), [`src/users`](src/users/README.md), [`src/devices`](src/devices/README.md), [`src/settings`](src/settings/README.md), [`src/pictograms`](src/pictograms/README.md), [`src/categories`](src/categories/README.md), [`src/vocabulary`](src/vocabulary/README.md), [`src/catalogs`](src/catalogs/README.md), [`src/patients`](src/patients/README.md), [`src/profiles`](src/profiles/README.md), [`src/sync`](src/sync/README.md), [`src/voices`](src/voices/README.md), [`src/sessions`](src/sessions/README.md), [`src/notes`](src/notes/README.md), [`src/homework`](src/homework/README.md), [`src/family`](src/family/README.md), [`src/audit`](src/audit/README.md), [`src/data-requests`](src/data-requests/README.md), [`src/jobs`](src/jobs/README.md), [`src/institutions`](src/institutions/README.md). La bóveda de Obsidian `../caa-documentacion` tiene la vista general (arquitectura, base de datos, estado de las specs, acuerdos).

## Puesta en marcha

Requisitos: Node ≥ 22.13 (lo exige pnpm 11; Prisma 7 pide ≥ 20.19) y PostgreSQL 16.

```bash
pnpm install                 # también genera el cliente de Prisma
cp .env.example .env         # completar DATABASE_URL, JWT_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD
pnpm db:deploy               # aplica prisma/migrations (o `pnpm db:migrate` en desarrollo)
pnpm db:seed                 # crea el administrador de «Centro» y, con SUPER_ADMIN_*, el super administrador
pnpm db:seed:vocabulary      # vocabulario básico desde ARASAAC (requiere el bucket)
pnpm start:dev               # http://localhost:3000, Swagger en /docs
pnpm start:worker            # en otra terminal: genera los PDF, ZIP y voces de la cola
```

`db:seed` (`prisma/seed.ts`) crea el administrador **solo si aún no existe ninguno**, con clave temporal que debe cambiar al entrar. Correrlo otra vez no cambia nada. No hay endpoint ni comando que cree administradores.

## Docker (spec 114)

`compose.yaml` es la producción en la red del Centro: API, worker y Redis (sin publicar); la base sigue en Neon (`DATABASE_URL` del `.env`). `LAN_IP` en el `.env` es la IP de este equipo en la red local: la API se publica en `http://<LAN_IP>:3000` y esa es la `EXPO_PUBLIC_API_URL` de las tabletas (sin `LAN_IP`, solo `127.0.0.1`).

```bash
docker compose run --rm migrate                          # aplica prisma/migrations (una vez por despliegue, antes de up)
docker compose up -d                                     # producción: API en <LAN_IP>:3000, worker y Redis
docker compose -f docker-compose.dev.yaml up             # desarrollo: código montado y recarga sola (tras cambiar dependencias, up --build -V)
docker compose -f docker-compose.dev.yaml run --rm test  # e2e contra un PostgreSQL efímero, sin tocar Neon (una suite: … run --rm test test/auth.e2e-spec.ts)
```

La imagen de producción lleva solo `dist` y las dependencias de producción, con ffmpeg, y corre como `node`. En `compose.yaml` `TRUST_PROXY_HOPS` es 0: la API se publica directo, sin Nginx. El clonador de voz sigue en el anfitrión y el worker lo llama en `http://host.docker.internal:8080`: `Clonar-voz` debe escuchar en una IP que alcance Docker (hoy `app.py` escucha solo en `127.0.0.1`).

## Variables de entorno

| Variable                                                                                       | Uso                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                 | Conexión **directa** a PostgreSQL (app y CLI de Prisma). En Neon, el host sin `-pooler`: la RLS por institución (spec 113) usa estado de sesión |
| `DATABASE_POOL_MAX`                                                                            | Conexiones del pool de cada proceso (API y worker), por defecto 20. Con 10 se agotaba con 20 tabletas a la vez (`test/perf`) |
| `DATABASE_URL_TEST`                                                                            | Base para `pnpm test` (las pruebas **borran tablas**). Si falta, usan `DATABASE_URL`: solo si esa base es de pruebas         |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`                                                  | Administrador inicial de «Centro» que crea `pnpm db:seed`                                                                    |
| `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`                                | Super administrador de la plataforma (spec 113) que crea `pnpm db:seed`                                                      |
| `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET` | Bucket S3 de Neon (imágenes); la base guarda solo el path                                                                    |
| `APP_KEY`                                                                                      | Clave de la app móvil (header `X-App-Key`); la misma que `EXPO_PUBLIC_APP_KEY` en `frontend/.env.local`                      |
| `CONSENT_ENCRYPTION_KEY`                                                                       | Cifra la foto del consentimiento (AES-256-GCM, 32 bytes en base64). Si se pierde, no se pueden leer: respaldarla aparte      |
| `VOICE_CLONE_URL`                                                                              | Clonación de voz (`Clonar-voz`), la llama el worker de la cola; por defecto `http://127.0.0.1:8080`                          |
| `FFMPEG_PATH`, `FFPROBE_PATH`                                                                  | ffmpeg del sistema para convertir a m4a las grabaciones del navegador (por defecto, los del PATH)                            |
| `JWT_SECRET`                                                                                   | Firma del access token (HS256)                                                                                               |
| `JWT_ACCESS_TTL`                                                                               | Vigencia del access token (por defecto `15m`)                                                                                |
| `CORS_ORIGINS`                                                                                 | Orígenes de la web, separados por coma                                                                                       |
| `WEB_URL`                                                                                      | Base del enlace de recuperación (`/reset-password?token=…`)                                                                  |
| `SMTP_*`, `MAIL_FROM`                                                                          | SMTP institucional. Sin `SMTP_HOST` el correo se escribe en el log; en producción es obligatorio                             |
| `TRUST_PROXY_HOPS`                                                                             | Proxies delante de la app (Nginx = 1), para la IP real                                                                       |
| `REDIS_URL`                                                                                    | Caché de 60 s (spec 114). Vacía: en la memoria de cada proceso; en Docker, `redis://redis:6379`                              |
| `LAN_IP`                                                                                       | Solo Docker: IP de la red local donde se publica la API (por defecto `127.0.0.1`)                                            |

## Endpoints de auth

| Método y ruta                | Cuerpo                                          | Respuesta                                                                                                      |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /auth/login`           | `{ email, password }`                           | `200 { accessToken, user: { id, name, role, mustChangePassword, hasPin } }` + cookie `refresh`                 |
| `POST /auth/refresh`         | cookie `refresh` (app: `{ refreshToken }`)      | `200 { accessToken, user }` + cookie rotada                                                                    |
| `POST /auth/logout`          | cookie `refresh` (app: `{ refreshToken }`)      | `204`                                                                                                          |
| `POST /auth/forgot-password` | `{ email }`                                     | `204` siempre                                                                                                  |
| `POST /auth/reset-password`  | `{ token, newPassword }`                        | `204` / `400 InvalidToken`                                                                                     |
| `POST /auth/change-password` | Bearer + `{ currentPassword, newPassword }`     | `200` igual que login (cookie rotada, demás sesiones cerradas) / `400 WrongPassword` / `400 PasswordUnchanged` |
| `PUT /auth/pin`              | Bearer (terapeuta) + `{ currentPassword, pin }` | `204` / `400 WrongPassword` / `400 WeakPin` (PIN de tableta, spec 002)                                         |

### Clave temporal

1. El administrador crea la cuenta o asigna una clave temporal (spec 102): `mustChangePassword = true`.
2. El login responde `user.mustChangePassword: true`. La web debe mostrar la pantalla de cambio.
3. Mientras tanto, toda ruta protegida responde `403 PasswordChangeRequired`, salvo `POST /auth/change-password`.
4. Cambiar la contraseña, o recuperarla por correo, quita la marca. El efecto es inmediato porque el JWT se valida contra la base en cada petición.

La app móvil (con `X-App-Key`) no guarda cookies: login, refresh y change-password le devuelven además `refreshToken` en el cuerpo, y lo manda en el cuerpo de refresh y logout.

La cookie `refresh` es `httpOnly`, `Secure`, `SameSite=Strict` y solo viaja a `/auth`. El cliente web debe usar `credentials: 'include'` y guardar el access token solo en memoria.

Errores, siempre con este formato: `{ "statusCode": 401, "error": "InvalidCredentials", "message": "Correo o contraseña incorrectos" }`.

## Endpoints de usuarios (spec 102)

Todos con `@Auth(Role.ADMIN)`.

| Método y ruta                        | Cuerpo                               | Respuesta                                                                   |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------- |
| `GET /users?role=&active=`           | —                                    | `200 [{ id, name, email, role, active, mustChangePassword, createdAt }]`    |
| `POST /users`                        | `{ name, email, temporaryPassword }` | `201` usuario `THERAPIST` con `mustChangePassword: true` / `409 EmailTaken` |
| `PATCH /users/:id`                   | `{ name?, email?, active? }`         | `200` usuario / `409 EmailTaken` / `409 LastActiveAdmin`                    |
| `POST /users/:id/temporary-password` | `{ temporaryPassword }`              | `204`                                                                       |
| `GET /users/:id/patients`            | —                                    | `200 [{ id, code, avatar }]`                                                |
| `PUT /users/:id/patients`            | `{ patientIds: [] }`                 | `200` lista nueva / `400 NotATherapist` / `400 UnknownPatients`             |

- **No se borra a nadie** (FR-001): desactivar es `PATCH { active: false }`, que cierra las sesiones; reactivar es `active: true`.
- Cambiar el correo o asignar una clave temporal también cierra las sesiones.
- Los administradores no se crean por la API: el inicial sale de `pnpm db:seed`.
- El admin ve el código y el avatar de los pacientes, nunca los datos clínicos.
- Todo se audita: `USER_CREATE`, `USER_UPDATE`, `TEMP_PASSWORD_SET`, `PATIENTS_ASSIGNED` (con los códigos agregados y quitados).

## Endpoints de tabletas (spec 103)

| Método y ruta                      | Acceso                              | Respuesta                                                                                                                |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `POST /devices/registration-codes` | ADMIN + `{ centerPin }` (5/min)     | `201 { code, expiresAt }` (8 caracteres, un uso, vigencia de `/settings`) / `409 CenterPinNotSet` / `403 WrongCenterPin` |
| `POST /devices/register`           | `X-App-Key` (10 por IP cada 15 min) | `201 { deviceId, token }` / `400 InvalidCode`                                                                            |
| `GET /devices`                     | ADMIN                               | lista con `lastSeenAt`, `lastSyncAt`, `revokedAt`, `stale`, `authorizedBy`                                               |
| `POST /devices/:id/revoke`         | ADMIN                               | `204`                                                                                                                    |
| `GET /devices/me`                  | tableta (`@DeviceAuth()`)           | `200 { deviceId, name }` / `401 DeviceUnauthorized`                                                                      |
| `GET /devices/settings`            | tableta (`@DeviceAuth()`)           | `200 { centerName, centerPin: { salt, hash, iterations }, therapistTimeoutMinutes }`                                     |

Las rutas de la tableta exigen `X-App-Key`, `Authorization: Device <token>`, `X-Device-Timestamp` y `X-Device-Signature` (ECDSA P-256 de `MÉTODO\nruta\ntimestamp`). Detalle en [`src/devices/README.md`](src/devices/README.md).

## Configuración del Centro (spec 103 FR-008)

Una sola fila (`CenterSettings`, id 1) que edita el administrador. Detalle en [`src/settings/README.md`](src/settings/README.md).

| Método y ruta              | Cuerpo                                                                | Respuesta                                                                            |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /settings`            | —                                                                     | `200 { centerName, hasCenterPin, therapistTimeoutMinutes, registrationCodeMinutes }` |
| `PATCH /settings`          | `{ centerName?, therapistTimeoutMinutes?, registrationCodeMinutes? }` | `200` igual que GET / `400 InvalidSetting`; audita `SETTINGS_UPDATE`                 |
| `PUT /settings/center-pin` | `{ currentPin?, pin }` (5/min)                                        | `200` igual que GET / `403 WrongCenterPin` / `400 WeakPin`; audita `CENTER_PIN_SET`  |

- El **PIN del Centro** es uno para todas las tabletas: se guarda como PBKDF2-SHA256 (`{ salt, hash, iterations }`), el mismo cálculo que hace la tableta para validarlo sin red.
- Las tabletas bajan nombre, PIN e inactividad del modo terapeuta con `GET /devices/settings` al registrarse y en cada sincronización.

## Endpoints de vocabulario (spec 105)

Todos con `@Auth(Role.THERAPIST)` salvo `GET /vocabulary` (tableta). Detalle en [`src/pictograms`](src/pictograms/README.md), [`src/categories`](src/categories/README.md) y [`src/vocabulary`](src/vocabulary/README.md).

| Método y ruta                                                                        | Qué hace                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `GET /categories` · `POST /categories` · `PATCH /categories/:id`                     | Catálogo de categorías (desactivar en vez de borrar) |
| `GET /categories/:id/pictograms`                                                     | Pictogramas de la categoría, paginados               |
| `POST /categories/:id/pictograms` · `DELETE /categories/:id/pictograms/:pictogramId` | Agrega uno al final / lo quita (sin mandar la lista) |
| `PUT /categories/:id/pictograms`                                                     | Reordena: reemplaza la lista completa                |
| `GET /pictograms?q=` · `PATCH /pictograms/:id`                                       | Pictogramas guardados                                |
| `GET /pictograms/arasaac?q=` · `POST /pictograms/arasaac`                            | Buscar en ARASAAC y copiar al bucket                 |
| `POST /pictograms`                                                                   | Imagen propia (PNG/JPEG ≤ 1 MB)                      |
| `GET /vocabulary`                                                                    | Tableta: catálogo activo con URLs firmadas           |

## Paginación

**Todo listado se pagina** (constitución §3): `?page=1&limit=20` (20 por defecto, máximo 100; fuera de rango → `400`).

```json
{ "items": [], "page": 1, "limit": 20, "total": 57, "totalPages": 3 }
```

- Piezas comunes en `src/common/pagination/`: `PaginationQuery` (DTO que extienden los filtros de cada listado), `Page`/`PageRequest`/`toPage`/`mapPage` (tipos puros que usan los puertos).
- Cada consulta paginada ordena con un desempate único (`id`) para que ninguna página repita ni salte registros.
- Quien necesite todo (la tableta, para trabajar sin red) recorre las páginas.

| Listado                          | Orden                                                 |
| -------------------------------- | ----------------------------------------------------- |
| `GET /users`                     | nombre                                                |
| `GET /users/:id/patients`        | código                                                |
| `GET /devices`                   | más reciente primero                                  |
| `GET /categories`                | orden, nombre (con `pictogramCount`, sin pictogramas) |
| `GET /categories/:id/pictograms` | orden en la categoría                                 |
| `GET /pictograms?q=`             | etiqueta                                              |
| `GET /pictograms/arasaac?q=`     | relevancia de ARASAAC (paginado sobre la caché)       |
| `GET /vocabulary`                | orden de categorías (tableta)                         |

## Proteger un endpoint

Los guards son globales (rate limit → JWT → rol). Cada método del controller declara su nivel; si no declara ninguno, se rechaza.

```ts
import { AllowTemporaryPassword, Auth, GetUser, Public, Role, type AuthenticatedUser } from '../auth';

@Public()                       // sin token (solo las rutas que lista la constitución)
@Auth()                         // cualquier usuario autenticado
@Auth(Role.ADMIN)               // solo administradores
@Auth(Role.THERAPIST)           // solo terapeutas (el admin no ve datos clínicos)
mine(@GetUser() user: AuthenticatedUser) {}
@AllowTemporaryPassword()       // junto a @Auth: usable con clave temporal (solo change-password)
@DeviceAuth()                   // rutas de la tableta: X-App-Key + token de dispositivo + firma
```

Otros módulos importan desde `src/auth` (`index.ts`), nunca rutas internas. `AuthModule` exporta `AuthRepository`, `PasswordHasher` y `AuthAuditLog` para que users (102) asigne claves temporales con `user.assignTemporaryPassword(hash)` y `savePasswordChange(user, now)`, que también revoca las sesiones.

Rate limit: por usuario si trae un token válido y por IP si no. Valores globales en `src/app.module.ts`; cada ruta sensible ajusta los suyos con `@Throttle`.

## Pacientes, perfiles y sincronización (specs 104–106)

Detalle en [`src/catalogs`](src/catalogs/README.md), [`src/patients`](src/patients/README.md), [`src/profiles`](src/profiles/README.md) y [`src/sync`](src/sync/README.md).

| Método y ruta                                                                 | Quién                   | Qué hace                                                                                           |
| ----------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `GET/POST /catalogs/:kind` · `PATCH/DELETE /catalogs/:kind/:id`               | admin y terapeuta       | Avatares (solo admin), diagnósticos y condiciones                                                  |
| `POST /patients` (multipart con la foto del consentimiento)                   | admin                   | Registra la ficha mínima, el avatar y las terapeutas                                               |
| `GET /patients` · `GET/PATCH /patients/:id` · `POST /patients/:id/discharge`  | terapeuta asignada      | Ficha, edición y alta reversible (`/reactivate`); el admin filtra con `assignedTo`/`notAssignedTo` |
| `GET /patients/:id/consent`                                                   | admin y terapeuta       | Consentimiento descifrado (AES-256-GCM)                                                            |
| `GET/PATCH /patients/:id/profile` · `PATCH …/profile/pictograms/:pictogramId` | terapeuta asignada      | Cuadrícula, nivel, voz, barra de frase y pictogramas ocultos                                       |
| `GET /sync/profiles?since=` · `POST /sync/batch`                              | tableta (`@DeviceAuth`) | Baja perfiles cambiados; sube sesiones y eventos (idempotente)                                     |
| WebSocket `/ws`                                                               | tableta y terapeuta     | Lotes en vivo con `ack` y vista en vivo de un paciente                                             |

## Perfil desde el panel, voz clonada, sesiones, observaciones y auditoría (specs 010, 105, 107–109)

Detalle en [`src/profiles`](src/profiles/README.md), [`src/voices`](src/voices/README.md), [`src/sessions`](src/sessions/README.md), [`src/notes`](src/notes/README.md) y [`src/audit`](src/audit/README.md).

| Método y ruta                                                                                                            | Quién              | Qué hace                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------- |
| `POST/DELETE /patients/:id/profile/categories[/:cid]` · `POST …/categories/:cid/pictograms` · `DELETE …/pictograms/:pid` | terapeuta asignada | Arma el tablero del paciente copiando del catálogo                                |
| `PUT/DELETE /patients/:id/profile/pictograms/:pid/recording`                                                             | terapeuta asignada | Grabación de la terapeuta (m4a ≤ 200 KB)                                          |
| `GET/POST/DELETE /patients/:id/voice` · `POST /patients/:id/voice/generate`                                              | terapeuta asignada | Voz clonada con consentimiento; genera a pedido los audios que faltan del tablero |
| `GET /patients/:id/sessions` · `GET /sessions/:id` · `GET /patients/:id/reports`                                         | terapeuta asignada | Sesiones, detalle e indicadores (el PDF va por la cola: ver abajo)                |
| `GET/POST /patients/:id/notes` · `PATCH /notes/:id` · `GET/POST /patients/:id/goals` · `PATCH /goals/:id`                | terapeuta asignada | Observaciones (24 h para editar) y objetivos                                      |
| `GET /audit` · `GET /audit/:id` · `GET /audit/csv`                                                                       | admin              | Auditoría filtrada y su CSV                                                       |

## Representantes, deberes y práctica en casa (spec 112)

Rol `PARENT`: solo el admin crea la cuenta (`POST /users` con `role: 'PARENT'`) y le vincula sus hijos (`PUT /users/:id/patients`, muchos a muchos). El representante solo lee; escribe la práctica en casa y "deber hecho". Detalle en [`src/homework`](src/homework/README.md) y [`src/family`](src/family/README.md).

| Método y ruta                                                             | Rol                | Qué hace                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /notes/:id/sharing` `{ sharedWithFamily }`                         | terapeuta asignada | Comparte una observación con la familia (sin la regla de 24 h)                                                               |
| `GET/POST /patients/:id/homework` · `PATCH/DELETE /homework/:id`          | terapeuta asignada | Deberes: instrucción, 1 a 12 pictogramas del tablero, fecha límite y actividad opcional; `409 HomeworkDone` si ya está hecho |
| `GET /family/patients` · `GET /family/patients/:id`                       | representante      | Sus hijos e información básica (`403 PatientNotLinked` si no es suyo)                                                        |
| `GET /family/patients/:id/profile` · `/sessions` · `/notes` · `/homework` | representante      | Tablero, sesiones (terapia y casa), observaciones compartidas y deberes                                                      |
| `POST /family/homework/:id/complete`                                      | representante      | Marca el deber hecho (idempotente)                                                                                           |
| `POST /family/practice`                                                   | representante      | Práctica en casa: el mismo lote que `/sync/batch`, con `homeworkId` opcional; queda como sesión `HOME`                       |

La lista de sesiones lleva `kind` (`THERAPY`/`HOME`), `guardianName` y `homeworkId`; los indicadores del reporte cuentan solo terapia.

## Derechos sobre los datos (spec 110)

Detalle en [`src/data-requests`](src/data-requests/README.md). Las solicitudes guardan el código del paciente y sobreviven a su eliminación.

| Método y ruta                                                                 | Quién                                 | Qué hace                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /patients/:id/data-requests` `{ type, notes?, statisticalUseAllowed? }` | terapeuta asignada                    | Registra un pedido `ACCESS`, `RECTIFICATION` o `DELETION` (plazo de 15 días)                                |
| `GET /data-requests?status&type&page&limit`                                   | admin (todas) y terapeuta (las suyas) | Solicitudes con `dueAt` y `deadline` (`OVERDUE`, `DUE_SOON`, `ON_TIME`)                                     |
| `POST /patients/:id/export-jobs`                                              | terapeuta asignada                    | Encola el ZIP con ficha y reporte en PDF y CSV de observaciones, objetivos, sesiones, eventos y actividades |
| `POST /data-requests/:id/complete` `{ notes }`                                | terapeuta asignada                    | Cierra una rectificación con el motivo                                                                      |
| `POST /data-requests/:id/reject` `{ notes }`                                  | admin                                 | Rechaza con motivo                                                                                          |
| `POST /data-requests/:id/execute-deletion` `{ confirmCode }`                  | admin                                 | Elimina al paciente (doble confirmación con su código); las tabletas lo quitan al sincronizar               |

## Varias instituciones (spec 113)

Una sola API y una sola base para varios centros (modelo *pool*): cada tabla de un centro lleva `institutionId` y nadie ve ni cambia filas de otra institución. Son dos candados:

1. **La institución de la petición** sale solo de la credencial: del usuario del JWT (`JwtStrategy`) o de la tableta del token (`DeviceTokenGuard`). El interceptor global `TenancyInterceptor` corre cada petición dentro de ese contexto (`AsyncLocalStorage`, [`src/tenancy`](src/tenancy/tenancy.ts)). El WebSocket y el worker hacen lo mismo con `inInstitution`.
2. **RLS de PostgreSQL**: al tomar una conexión, el pool de `PrismaService` la deja con el rol `necon_app` (sin `BYPASSRLS` y sin ser dueño de las tablas) y la institución en `app.institution_id`. Cada tabla con `institutionId` tiene la política `institution_isolation` para leer y escribir, y la columna toma ese valor por defecto. Aunque un repositorio o un SQL directo olvide filtrar, la base solo devuelve filas de esa institución.

Fuera de una petición (migraciones, semillas, scripts, el worker al tomar un trabajo, las pruebas al preparar datos) se usa el dueño de las tablas, sin RLS. `asSystem()` es solo para lo que debe buscar en todas las instituciones con un secreto: usuario por correo o por token, tableta por token o por código, y las rutas `/platform/*` del super administrador.

| Por institución                    | Cómo                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Código de paciente `P-0001`        | `CenterSettings.lastPatientNumber` (un `UPDATE` que bloquea la fila: nunca se repite)    |
| Configuración del Centro y versión | `CenterSettings` y `GlobalSyncVersion` con `institutionId` como clave                    |
| Nombres únicos                     | `User(institutionId, email)`, `Patient(institutionId, code)`, catálogos por nombre, `Pictogram(institutionId, arasaacId)` |
| Correo en dos instituciones        | login con `409 ChooseInstitution { institutions }` y se repite con `institutionId`       |

Las pruebas siguen OWASP ASVS 5.0 V8.4.1, WSTG-ATHZ-02/04 y API1/API5 de OWASP API Top 10 2023 ([`test/tenancy.e2e-spec.ts`](test/tenancy.e2e-spec.ts)). Recorren cada ruta de Swagger con cada cuenta de A contra los ids de B, revisan cada listado y que los datos de B no cambien. También cubren la tableta, el WebSocket, el worker, el SQL directo bajo RLS y que toda tabla con `institutionId` tenga su política.

## Caché (spec 114)

Los repositorios de Prisma guardan 60 s la cuenta que valida cada JWT (`account:<userId>`), la tableta del token (`device:<tokenHash>`) y la configuración de cada institución (`inst:<institutionId>:settings`). Cada escritura de ese usuario, esa tableta o esa configuración borra su clave: una desactivación, una revocación o un cambio de clave aplican en la siguiente petición. Con `REDIS_URL` vive en Redis (la comparten la API y el worker); sin él, en la memoria de cada proceso. Lo que se cambia directo en la base (desactivar una institución) tarda hasta 60 s.

## Documentos en segundo plano (cola)

Detalle en [`src/jobs`](src/jobs/README.md). Generar un PDF o un ZIP usa CPU; si se hiciera dentro de la petición, la API dejaría de atender a todos (tabletas incluidas) mientras dibuja. Por eso la API solo **valida y encola** (`202` con el id) y un **worker en otro proceso** hace un documento a la vez y deja el archivo en el bucket. La cola es la tabla `Job` de PostgreSQL (`FOR UPDATE SKIP LOCKED`): sobrevive a reinicios y no agrega servicios.

| Método y ruta                                 | Quién                      | Qué hace                                                                                         |
| --------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /patients/:id/reports/pdf-jobs?from&to` | terapeuta asignada         | `202` trabajo `REPORT_PDF` en cola; un pedido igual en curso devuelve el mismo                   |
| `POST /patients/:id/export-jobs`              | terapeuta asignada         | `202` trabajo `EXPORT_ZIP` (spec 110); al generarse atiende las solicitudes de acceso abiertas   |
| `GET /jobs/:id` · `GET /jobs?page&limit`      | terapeuta (solo los suyos) | estado, posición en la cola, error y, al terminar, `downloadUrl` (URL firmada del bucket, 5 min) |
| `DELETE /jobs/:id`                            | terapeuta (solo los suyos) | cancela mientras está en cola (`409 JobNotCancelable` si ya empezó)                              |

El worker se inicia aparte: `pnpm start:worker` (desarrollo, con recarga) o `node dist/worker` (producción). Sin worker, los pedidos quedan en cola y salen cuando arranca. La voz clonada (registrar la muestra y generar los audios del tablero) usa la misma cola en un carril aparte (`VOICE_REGISTER`, `VOICE_CLIPS`): generar un tablero tarda minutos y no atrasa los PDF.

## Estructura

```
src/
  common/            DomainException(kind) + GlobalExceptionFilter (único traductor kind → HTTP)
  prisma/            PrismaService (adapter pg)
  app.setup.ts       configuración HTTP común a main.ts y a las pruebas
  auth/
    index.ts         API pública del módulo (Auth, Public, GetUser, Role…)
    auth.module.ts   cableado puerto → adaptador
    domain/          entities, enums, exceptions, ports, password-policy (sin Nest ni Prisma)
    application/     un caso de uso por acción: login, refresh, logout, forgot/reset/change password, create-first-admin
    infrastructure/
      http/          ENTRADA: controller, auth.dto, auth.decorators, guards, jwt.strategy
      prisma/        SALIDA: repositorio, mapper, auditoría
      security/      SALIDA: argon2, JWT y tokens opacos
      mail/          SALIDA: correo de recuperación (nodemailer)
  users/
    users.module.ts
    domain/          ports/users.repository, exceptions (la entidad User es la de auth)
    application/     list, create-therapist, update, assign-temporary-password, get/replace assigned patients
    infrastructure/
      http/          users.controller, users.dto
      prisma/        users.prisma.repository
  devices/           tabletas (spec 103): códigos, registro, token + firma ECDSA, revocación → README.md
  settings/          configuración del Centro y PIN del Centro (spec 103 FR-008) → README.md
  pictograms/ categories/ vocabulary/   vocabulario del Centro (spec 105) → README.md
  catalogs/ patients/ profiles/ sync/   pacientes, perfiles y sincronización (specs 104–106) → README.md
  voices/ sessions/ notes/ audit/        voz clonada, sesiones, observaciones y auditoría (specs 010, 107–109) → README.md
  homework/ family/                      deberes y modo familia de los representantes (spec 112) → README.md
  data-requests/                         derechos sobre los datos: solicitudes, exportación ZIP y eliminación (spec 110) → README.md
  common/pdf/                            pdfmake con fuentes estándar, barras vectoriales y tablas
prisma/
  schema.prisma      modelos de las specs 101–112 (diagnóstico y condiciones como catálogos)
  seed.ts            administrador inicial
  migrations/        una por cambio de esquema (inicial con la secuencia patient_code_seq, PIN, pacientes, voces, auditoría solo inserción, CenterSettings…)
```

## Probar la API a mano (Postman / Insomnia)

`docs/postman/necon.postman_collection.json` (formato Postman v2.1; Insomnia lo importa igual): 86 peticiones en carpetas por módulo.

1. Importa el archivo y completa las variables de la colección: `baseUrl`, `appKey` (= `APP_KEY`), `adminPassword`, `therapistPassword` y `centerPin` (PIN del Centro, para generar códigos).
2. Ejecuta **Login admin** o **Login terapeuta**: el token queda en `{{accessToken}}`.
3. Las peticiones que crean algo guardan su id (`userId`, `categoryId`, `pictogramId`, `deviceId`, `registrationCode`, `avatarId`, `patientId`, `catalogItemId`) para las siguientes.

Las rutas de la tableta (`/devices/me`, `/therapists`, `/vocabulary`, `/sync/*`) exigen una firma con la llave del Keystore: en Postman responden 401 a propósito; se prueban con la app o con las e2e.

## Pruebas

Son **e2e**: levantan la app real (mismos guards, pipes y filtro que `main.ts`) contra PostgreSQL y prueban los criterios de aceptación de las specs 002, 008, 010 y 101–113, más el aislamiento entre instituciones, la validación y el saneamiento de entradas y los límites de las imágenes (`tenancy`, `institution-requests` y `uploads`).

```bash
# Usa DATABASE_URL_TEST, o DATABASE_URL si no está. Borra tablas: nunca contra producción.
pnpm test        # aplica las migraciones en la base de pruebas y corre test/*.e2e-spec.ts
```

- `test/app.ts` arma la app, limpia las tablas antes de cada prueba y captura los correos.
- Cada login usa otra IP (`X-Forwarded-For`) para no chocar con el rate limit: hace falta `TRUST_PROXY_HOPS=1` (si el `.env` tiene `0`, pásalo en la línea de comando).
- Sin `AWS_ENDPOINT_URL_S3` se usa un bucket en memoria; vacíalo en la línea de comando para no tocar el bucket real.

```bash
# Base aislada en Docker:
docker run -d --name necon-test-db -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
L=postgresql://postgres:test@localhost:55432/postgres
DATABASE_URL=$L DATABASE_URL_TEST=$L AWS_ENDPOINT_URL_S3= TRUST_PROXY_HOPS=1 pnpm exec jest --config ./test/jest-e2e.json --runInBand
```

## Estilo de código

Prettier con `printWidth: 140` y `objectWrap: "collapse"`: lo corto va en una línea, los imports en horizontal y los comentarios con `//`. Las entidades exponen sus datos de solo lectura con `interface X extends Readonly<XProps>` (sin un getter por campo) y solo sus métodos los cambian.

## Pendiente en auth

| Falta                                            | Cuándo                              |
| ------------------------------------------------ | ----------------------------------- |
| Rate limit con storage en Redis (hoy en memoria) | Al agregar docker compose con Redis |
