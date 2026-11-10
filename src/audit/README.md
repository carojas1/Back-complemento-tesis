# Módulo `audit`

Consulta y exportación de la auditoría (spec 109), solo del administrador. La escritura no vive aquí: cada caso de uso registra lo suyo con el puerto `AuthAuditLog` del módulo `auth`, y la base **solo admite INSERT** en `AuditLog` (trigger `audit_log_insert_only`).

| Dato    | Valor                                                                     |
| ------- | ------------------------------------------------------------------------- |
| Spec    | [109 — Auditoría](../../../caa-spec-driven-development-SDD-/specs/109-auditoria/spec.md) |
| Tabla   | `AuditLog` (código del paciente, nunca su nombre)                         |
| Pruebas | [`test/audit.e2e-spec.ts`](../../test/audit.e2e-spec.ts)                  |

## Endpoints (admin)

| Método y ruta                                              | Qué hace                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /audit?actorId&action&patientCode&from&to&page&limit` | registros filtrados, de lo más nuevo a lo más viejo, con el nombre del usuario o la tableta                   |
| `GET /audit/csv?…`                                         | el mismo filtro en CSV (UTF-8 con BOM, hasta 50 000 filas); la exportación también se audita (`AUDIT_EXPORT`) |
| `GET /audit/:id`                                           | detalle de un registro: acción, entidad, quién (con nombre), IP, fecha y resumen; `AuditRecordNotFound` si no existe |

## Reglas

| Regla                                                                                                                                                 | Dónde se cumple                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Nadie modifica ni borra registros (FR-003)                                                                                                            | migración `20261024010000_audit_insert_only` (trigger; `REVOKE` si existe el rol `app_user`) |
| Se auditan además: lectura de ficha y consentimiento, perfil, voz, vista en vivo (`LIVE_WATCH`), sesiones (`SESSION_READ`), observaciones y objetivos | casos de uso de cada módulo                                                                  |

## Para agentes de IA

- ⚑ Falta el segundo rol de base de datos (migrador dueño + `app_user` sin UPDATE/DELETE) y su URL de conexión; el trigger ya protege la tabla.
- Las pruebas usan `TRUNCATE`, que no dispara el trigger por fila.

## Exportar

`GET /audit/csv`, `/audit/xlsx` y `/audit/pdf` usan el mismo filtro que la consulta, solo para el administrador. El Excel llega hasta 50 000 registros y el PDF hasta 2000, con un aviso cuando quedan registros fuera. Cada exportación se audita con su formato (`AUDIT_EXPORT`). En Excel todo se escribe como texto y en CSV un valor con forma de fórmula lleva una comilla delante, para que un nombre escrito por alguien no se ejecute al abrir el archivo.
