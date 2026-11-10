# Módulo `notifications`

Bandeja de avisos de los paneles de administración. Las notificaciones `PLATFORM` son para los super administradores
(sin institución); las `INSTITUTION`, para los administradores de un centro. Una fila por audiencia: la primera persona
que la lee la marca leída para todo el equipo.

| Dato    | Valor                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------- |
| Tabla   | `Notification` (RLS: un centro lee solo sus filas; las de la plataforma no tienen institución) |
| Exporta | `NotificationPublisher` (puerto que usa `institutions`)                                        |
| Pruebas | [`test/platform-admin.e2e-spec.ts`](../../test/platform-admin.e2e-spec.ts)                     |

## Endpoints

| Método y ruta                     | Acceso                 | Respuesta                             |
| --------------------------------- | ---------------------- | ------------------------------------- |
| `GET /notifications?unreadOnly`   | `SUPER_ADMIN`, `ADMIN` | página, de la más nueva a la vieja    |
| `GET /notifications/unread-count` | `SUPER_ADMIN`, `ADMIN` | `{ unread }` (contador de la campana) |
| `POST /notifications/:id/read`    | `SUPER_ADMIN`, `ADMIN` | `204` / `404 NotificationNotFound`    |
| `POST /notifications/read-all`    | `SUPER_ADMIN`, `ADMIN` | `{ updated }`                         |

## Reglas

- La bandeja sale solo de la credencial (`readerOf(user)`), nunca de la petición.
- El rol de la API solo lee y marca; `NotificationPrismaPublisher` inserta como dueño de la tabla (`asSystem`).
- Una notificación que falla nunca rompe la acción que la generó: queda en el log.

| Tipo                          | Audiencia    | La envía                                  |
| ----------------------------- | ------------ | ----------------------------------------- |
| `INSTITUTION_REQUEST_CREATED` | plataforma   | `RequestInstitutionUseCase` (y un correo) |
| `INSTITUTION_APPROVED`        | centro nuevo | `PlatformUseCases.approve`                |
| `INSTITUTION_REACTIVATED`     | centro       | `SetInstitutionStatusUseCase`             |
