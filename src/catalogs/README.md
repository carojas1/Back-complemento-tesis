# Módulo `catalogs`

Listas ampliables que usa la ficha del paciente: **avatares** (imagen en el bucket), **diagnósticos** y **condiciones**. Son tablas, no enums: el personal las lista, agrega, renombra, desactiva o elimina sin tocar código.

| Dato       | Valor                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Spec       | [104 — Pacientes](../../../caa-spec-driven-development-SDD-/specs/104-pacientes/spec.md) (FR-002), acuerdo 2026-10-23        |
| Depende de | `auth` (decoradores, `AuthAuditLog`), `common/storage` (`FileStorage`)                                        |
| Tablas     | `Avatar`, `Diagnosis`, `Condition`                                                                            |
| Pruebas    | [`test/catalogs.e2e-spec.ts`](../../test/catalogs.e2e-spec.ts)                                                |
| Semilla    | `pnpm db:seed:avatars` (8 caras de animales en SVG: [`prisma/avatars.seed.ts`](../../prisma/avatars.seed.ts)) |

## Endpoints

| Método y ruta                | Quién             | Cuerpo                                             | Respuesta                                                |
| ---------------------------- | ----------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `GET /catalogs/:kind`        | admin y terapeuta | `?page&limit&active=true`                          | `Page<{ id, name, active, imageUrl? }>`                  |
| `POST /catalogs/avatars`     | admin             | multipart `name` + `image` (SVG/PNG/JPEG ≤ 200 KB) | `201` avatar con URL firmada                             |
| `POST /catalogs/:kind`       | admin y terapeuta | `{ name }` (diagnósticos y condiciones)            | `201` / `409 CatalogNameTaken` / `403 AvatarsAdminOnly`  |
| `PATCH /catalogs/:kind/:id`  | admin y terapeuta | `{ name?, active? }`                               | `200`                                                    |
| `DELETE /catalogs/:kind/:id` | admin y terapeuta | —                                                  | `{ deleted: true }` o `{ deleted: false }` (desactivado) |

`:kind` es `avatars`, `diagnoses` o `conditions` (`ParseEnumPipe`).

## Reglas de negocio

| Regla                                                                                      | Dónde se cumple                                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Los avatares solo los gestiona el admin; diagnósticos y condiciones, también la terapeuta  | `AvatarsAdminOnly` en los casos de uso                                    |
| Nombre único por catálogo (sin distinguir mayúsculas)                                      | `CatalogNameTaken`                                                        |
| Borrar algo que ya usa un paciente **lo desactiva** (no rompe fichas viejas)               | `delete-catalog-item.use-case.ts`                                         |
| Un valor desactivado no se ofrece al elegir, pero las fichas que lo tienen lo conservan    | `?active=true` en la app; `update-patient` solo valida los valores nuevos |
| La imagen del avatar va a `avatars/<uuid>.<ext>` en el bucket; la API devuelve URL firmada | `create-catalog-item.use-case.ts`, `catalog-view.ts`                      |
| Cada alta, cambio y borrado se audita (`CATALOG_*`)                                        | `AuthAuditLog`                                                            |

## Para agentes de IA

- Un catálogo nuevo = una tabla más en `catalogKinds` y en el delegado del repositorio Prisma; no un enum.
- Las pruebas crean filas `e2e-*` y las borran al final: no truncan los catálogos reales.
