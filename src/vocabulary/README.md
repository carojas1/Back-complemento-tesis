# Módulo `vocabulary`

**Lo que lee la tableta**: las categorías activas con sus pictogramas activos, en orden y con URLs firmadas. Solo lectura; los datos se editan en [`categories`](../categories/README.md) y [`pictograms`](../pictograms/README.md). Lo reemplaza `GET /sync/profiles` cuando exista la spec 106.

| Dato             | Valor                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs            | [105](../../../caa-spec-driven-development-SDD-/specs/105-perfil-comunicacion/spec.md) (lectura del catálogo), [003 — Descarga de vocabulario](../../../caa-spec-driven-development-SDD-/specs/003-descarga-vocabulario/spec.md) |
| Depende de       | `devices` (`@DeviceAuth`), mappers de `categories` y `pictograms`, `common/storage`                                                                                                                |
| Tablas (lectura) | `Category`, `CategoryPictogram`, `Pictogram`                                                                                                                                                       |
| Pruebas          | [`test/vocabulary.e2e-spec.ts`](../../test/vocabulary.e2e-spec.ts)                                                                                                                                 |

## Reglas

- Solo llegan categorías **activas** y, dentro de ellas, pictogramas **activos**, en el orden de la categoría.
- Paginado por categorías: la tableta, que necesita todo para trabajar sin red, **recorre todas las páginas**.
- Solo tabletas: exige `X-App-Key` + `Authorization: Device <token>` + firma del Keystore. Un JWT de usuario no sirve.

## Estructura

```
vocabulary/
├── vocabulary.module.ts               importa DevicesModule
├── domain/ports/vocabulary.repository.ts   listVocabulary(page) → CategoryWithPictograms
├── application/get-vocabulary.use-case.ts
└── infrastructure/
    ├── http/vocabulary.controller.ts  GET /vocabulary con @DeviceAuth()
    └── prisma/vocabulary.prisma.repository.ts
```

## Endpoint

| Método y ruta                  | Acceso  | Respuesta                                                                                            |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------- |
| `GET /vocabulary?page=&limit=` | tableta | Página de `{ id, name, color, sortOrder, pictograms: [{ id, arasaacId, label, active, imageUrl }] }` |
