# Módulo `limits`

Límites de cada centro: cuántas terapeutas activas y cuántas tabletas puede tener. El super administrador los fija en el
centro (`PATCH /platform/institutions/:id` con `maxTherapists` y `maxDevices`, en `institutions`); este módulo los hace
cumplir y se los muestra al administrador del centro.

| Dato       | Valor                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Tablas     | lee `Institution.maxTherapists`/`maxDevices`, `User` y `Device` bajo RLS (sin tabla propia)         |
| Exporta    | `QuotaReader` (lo usan `users` al crear una terapeuta y `devices` al generar un código de registro) |
| Depende de | `prisma`                                                                                            |
| Pruebas    | [`test/platform-admin.e2e-spec.ts`](../../test/platform-admin.e2e-spec.ts)                          |

## Endpoints

| Método y ruta | Acceso  | Respuesta                                                        |
| ------------- | ------- | ---------------------------------------------------------------- |
| `GET /limits` | `ADMIN` | `{ maxTherapists, maxDevices, activeTherapists, activeDevices }` |

```ts
interface QuotaUsage {
  maxTherapists: number | null; // null = sin límite
  maxDevices: number | null;
  activeTherapists: number; // usuarias THERAPIST activas (los representantes no cuentan)
  activeDevices: number; // tabletas sin revocar
}
```

## Reglas

- `null` = sin límite. Crear una terapeuta (`POST /users`) o un código de registro de tableta
  (`POST /devices/registration-codes`) cuando el centro ya llegó a su límite responde
  `409 { error: 'LimitReached', resource: 'therapists' | 'devices', limit }` con el mensaje
  `Este centro llegó a su límite de terapeutas (N)` (o `de tabletas (N)`).
- Todo se lee bajo RLS (`QuotaPrismaReader`): solo cuenta el centro de la petición.
- Bajar un límite por debajo del uso actual no borra nada: solo impide crear más. Reactivar una terapeuta existente
  todavía no se comprueba.

## Estructura

```
limits/
  limits.module.ts                              exporta QuotaReader
  domain/entities/quota.entity.ts               QuotaUsage, assertQuota
  domain/exceptions/limits.exceptions.ts        LimitReached
  domain/ports/quota.reader.ts                  QuotaReader
  application/get-limits.use-case.ts            GET /limits
  infrastructure/http/limits.controller.ts
  infrastructure/prisma/quota.prisma.reader.ts  conteos bajo RLS
```
