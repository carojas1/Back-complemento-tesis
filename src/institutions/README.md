# Módulo `institutions`

Varias instituciones en la misma API y la misma base (spec 113, modelo *pool*). Este módulo tiene solo lo de la **plataforma**: la solicitud pública de cuenta («Solicitar cuenta» en la app) y las rutas del **super administrador**. El aislamiento entre instituciones vive en `src/tenancy` y en la RLS de PostgreSQL, no aquí.

| Dato       | Valor                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Spec       | 113 (FR-005 a FR-007)                                                                                   |
| Tablas     | `Institution`, `InstitutionRequest` (de la plataforma: el rol de la API no las lee salvo su institución) |
| Depende de | `auth` (hasher, correo, auditoría), `devices` (`AppKeyGuard`), `common/storage` (copia de avatares)     |
| Pruebas    | [`test/institution-requests.e2e-spec.ts`](../../test/institution-requests.e2e-spec.ts)                   |

## Endpoints

| Método y ruta                         | Acceso                 | Respuesta                                                                                       |
| ------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `POST /institution-requests`          | público + `X-App-Key` o `Origin` de la web | `201 { id, status: 'PENDING', createdAt }`; 5 por hora por IP; `409 RequestAlreadyPending`, `409 InstitutionExists` |
| `GET /platform/requests?status&page`  | `SUPER_ADMIN`          | página sin datos de contacto                                                                    |
| `GET /platform/requests/:id`          | `SUPER_ADMIN`          | la solicitud completa; queda en la auditoría (`INSTITUTION_REQUEST_READ`)                        |
| `POST /platform/requests/:id/review`  | `SUPER_ADMIN`          | `PENDING → IN_REVIEW` con `contactedAt` y las notas de la llamada; cuerpo `{ notes }`             |
| `PATCH /platform/requests/:id/notes`  | `SUPER_ADMIN`          | guarda las notas de una solicitud abierta; cuerpo `{ notes }`                                     |
| `POST /platform/requests/:id/approve` | `SUPER_ADMIN`          | `201 { institution, admin: { id, email, temporaryPassword } }` (la clave se muestra una sola vez); `409 RequestAlreadyReviewed`                        |
| `POST /platform/requests/:id/reject`  | `SUPER_ADMIN`          | `204`; cuerpo `{ reason }`                                                                      |
| `GET /platform/institutions?page`     | `SUPER_ADMIN`          | página de instituciones                                                                         |
| `GET /platform/dashboard`             | `SUPER_ADMIN`          | solicitudes pendientes y vencidas (24 h), centros y la actividad de cada centro                  |
| `GET /platform/institutions/:id`      | `SUPER_ADMIN`          | el centro con su contacto, límites y administradores                                              |
| `PATCH /platform/institutions/:id`    | `SUPER_ADMIN`          | contacto, `maxTherapists` y `maxDevices` (`null` = sin límite, ver `src/limits`)                  |
| `POST /platform/institutions/:id/status` | `SUPER_ADMIN`       | suspende con `{ active: false, reason }` o reactiva; el centro plantilla nunca se suspende        |
| `POST /platform/institutions/:id/admins` | `SUPER_ADMIN`       | `201` otro administrador con `temporaryPassword` (también le llega por correo)                    |

## Reglas

- **Saneamiento del formulario** (`institutions.dto.ts`): espacios recortados y juntos, sin `<` `>` ni caracteres de control, RUC de 13 dígitos que termina en `001`, aviso de privacidad vigente (`privacyNoticeVersion`). Los campos que no son del formulario se descartan (`whitelist`).
- **Aprobar** es una transacción: marca la solicitud (solo si seguía abierta: `PENDING` o `IN_REVIEW`), crea la institución, su `CenterSettings` y su versión de sincronización, copia de la institución plantilla («Centro») los diagnósticos, las condiciones, los avatares (con su imagen copiada en el bucket) y las categorías con sus pictogramas de ARASAAC (comparten la imagen: nunca se borra), y crea el primer `ADMIN` con una clave temporal que se envía por correo.
- El super administrador **no tiene institución**: cualquier ruta de un centro le responde `403` y, aunque pasara, la RLS no le deja ver filas.
- Las solicitudes **rechazadas** se borran 180 días después de revisarlas (al listar), como dice el aviso de privacidad.
