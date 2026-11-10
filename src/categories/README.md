# Módulo `categories`

**Categorías del catálogo de vocabulario** (nombre, color, orden, activa) y **qué pictogramas tiene cada una, en qué orden**. Es la plantilla que se copiará al perfil de cada paciente (spec 105). Los pictogramas vienen de [`pictograms`](../pictograms/README.md).

| Dato       | Valor                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Spec       | [105 — Perfil de comunicación](../../../caa-spec-driven-development-SDD-/specs/105-perfil-comunicacion/spec.md) (FR-005) |
| Depende de | `auth` (auditoría, decoradores), `pictograms` (validar que existan, `toPictogramView`, mapper)            |
| Tablas     | `Category`, `CategoryPictogram`                                                                           |
| Lo usan    | `vocabulary` (mapper), `prisma/vocabulary.seed.ts`                                                        |
| Pruebas    | [`test/categories.e2e-spec.ts`](../../test/categories.e2e-spec.ts)                                        |

## Reglas de negocio

| Regla                                                                   | Origen                         | Dónde se cumple                              |
| ----------------------------------------------------------------------- | ------------------------------ | -------------------------------------------- |
| El vocabulario es un catálogo en la base: se amplía sin redesplegar     | Acuerdo 2026-10-21, 105 FR-005 | tablas `Category`, `CategoryPictogram`       |
| Nombre único sin distinguir mayúsculas; color `#RRGGBB`                 | 105                            | `CreateCategoryUseCase`, DTO                 |
| No se borra: se desactiva (la terapeuta la sigue viendo, la tableta no) | Acuerdo 2026-10-21             | `Category.edit({ active })`                  |
| El orden del arreglo es el orden en el tablero (arrastrar y soltar)     | 105 criterios                  | `PUT /categories/:id/pictograms`             |
| Agregar o quitar uno sin mandar la lista (necesario con paginación)     | Constitución §3                | `POST` / `DELETE /categories/:id/pictograms` |
| Quitar de la categoría no borra el pictograma                           | 105                            | `removeFromCategory`                         |
| Solo las terapeutas editan; todo se audita                              | Acuerdos, 109                  | `@Auth(Role.THERAPIST)`, `CATEGORY_*`        |

## Estructura

```
categories/
├── categories.module.ts                 importa PictogramsModule; exporta CategoriesRepository y casos de uso del seed
├── domain/
│   ├── entities/category.entity.ts      create / edit (devuelve los campos que cambiaron)
│   ├── exceptions/categories.exceptions.ts   CategoryNotFound, CategoryNameTaken, UnknownPictograms
│   └── ports/categories.repository.ts
├── application/                         list, create, update, list-category-pictograms, replace, add, remove
└── infrastructure/
    ├── http/                            categories.controller.ts, categories.dto.ts
    └── prisma/                          repositorio + mapper (el mapper lo reutiliza vocabulary)
```

## Endpoints

Todos con `@Auth(Role.THERAPIST)`. Listados paginados (`?page=&limit=`).

| Método y ruta                                    | Respuesta                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `GET /categories`                                | Página de categorías con `pictogramCount` (sin los pictogramas)                     |
| `POST /categories`                               | `{ name, color, sortOrder? }` → `201` / `409 CategoryNameTaken`                     |
| `PATCH /categories/:id`                          | `{ name?, color?, sortOrder?, active? }`                                            |
| `GET /categories/:id/pictograms`                 | Página de pictogramas en su orden, con `imageUrl` firmada                           |
| `POST /categories/:id/pictograms`                | `{ pictogramId }` → lo agrega al final (idempotente), `204`                         |
| `DELETE /categories/:id/pictograms/:pictogramId` | Lo quita de la categoría, `204`                                                     |
| `PUT /categories/:id/pictograms`                 | `{ pictogramIds }` → reordena (reemplaza la lista), `204` / `400 UnknownPictograms` |

## Para agentes de IA

- Si agregas un `DELETE /categories/:id`, rompes un acuerdo: se desactiva.
- Límite conocido (`ponytail:` en el repositorio): dos altas simultáneas pueden quedar con el mismo orden; se corrige reordenando.
- Pendiente: copiar esta plantilla al perfil de cada paciente al crearlo (104/105).
