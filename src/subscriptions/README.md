# Módulo `subscriptions`

Plan anual de cada centro: **2,00 USD al año** por defecto, pagado fuera de la plataforma y registrado por el super administrador. No hay pasarela de pago.

| Dato       | Valor                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- |
| Tablas     | `Subscription` (una por institución), `SubscriptionPayment` (RLS: un centro solo lee lo suyo) |
| Depende de | `auth` (auditoría), `notifications` (publicador)                                              |
| Pruebas    | [`test/clinical-agenda.e2e-spec.ts`](../../test/clinical-agenda.e2e-spec.ts)                  |

## Endpoints

| Método y ruta                                             | Acceso        | Respuesta                                                                                |
| --------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `GET /platform/payments`                                  | `SUPER_ADMIN` | todos los pagos, del más nuevo al más antiguo                                            |
| `GET /platform/institutions/:id/subscription`             | `SUPER_ADMIN` | plan con `effectiveStatus` y `daysLeft`                                                  |
| `PATCH /platform/institutions/:id/subscription`           | `SUPER_ADMIN` | `{ priceCents }`: configura la cuota anual de ese centro                                 |
| `GET /platform/institutions/:id/payments`                 | `SUPER_ADMIN` | pagos del centro                                                                         |
| `POST /platform/institutions/:id/payments`                | `SUPER_ADMIN` | `{ amountCents, method, reference?, paidAt? }` → plan y pago; `400 InvalidPaymentAmount` |
| `POST /platform/institutions/:id/subscription/cancel`     | `SUPER_ADMIN` | plan cancelado                                                                           |
| `POST /platform/institutions/:id/subscription/reactivate` | `SUPER_ADMIN` | vuelve a su periodo pagado si sigue vigente; si no, a un nuevo periodo de gracia         |
| `GET /subscription`                                       | `ADMIN`       | su plan                                                                                  |
| `GET /subscription/payments`                              | `ADMIN`       | sus pagos                                                                                |

## Reglas

- Un centro aprobado empieza en `PENDING_PAYMENT` con **30 días de gracia**; pasado ese plazo se muestra `OVERDUE`.
- Un pago es un año. Pagar mientras el plan sigue vigente agrega el año después del actual.
- El monto debe ser exactamente la cuota del centro: uno distinto es un error de digitación, no un descuento.
- `effectiveStatus` se deriva: `ACTIVE`, `EXPIRING_SOON` (≤ 30 días), `EXPIRED`, `PENDING_PAYMENT`, `OVERDUE`, `CANCELED`.
- Un plan vencido **no bloquea** el centro por sí solo: el super administrador decide y lo suspende desde `institutions`.
