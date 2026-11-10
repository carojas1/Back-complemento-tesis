# Módulo `health`

Healthcheck público que pide la constitución (§3). Lo llaman Docker (`healthcheck` del servicio `api`) y cualquier
monitor externo.

| Dato       | Valor                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Tablas     | ninguna (`SELECT 1` como dueño de la tabla, fuera de toda institución) |
| Depende de | `prisma`                                                               |
| Pruebas    | [`test/health.e2e-spec.ts`](../../test/health.e2e-spec.ts)             |

## Endpoints

| Método y ruta | Acceso  | Respuesta                                                                            |
| ------------- | ------- | ------------------------------------------------------------------------------------ |
| `GET /health` | público | `200 { status: 'ok', database: 'up' }` / `503 { status: 'error', database: 'down' }` |

## Reglas

- La base cuenta como caída si `SELECT 1` falla o tarda más de 3 s (`DatabasePrismaProbe`), así el healthcheck de Docker
  (timeout de 5 s) nunca espera el timeout del pool. La causa va al log, nunca a la respuesta.
- Sin sesión y fuera de los rate limits `short` y `medium` (`@SkipThrottle`); el límite por minuto sigue aplicando.
- No dice nada de las instituciones, la versión ni la configuración: es pública.
