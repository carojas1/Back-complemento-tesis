# Módulo `pictograms`

Pictogramas guardados en el servidor: **copias de ARASAAC** o **imágenes propias** de la terapeuta, con la imagen en el bucket S3 de Neon. Es la materia prima del catálogo de vocabulario: [`categories`](../categories/README.md) los ordena y [`vocabulary`](../vocabulary/README.md) los entrega a la tableta.

| Dato       | Valor                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Spec       | [105 — Perfil de comunicación](../../../caa-spec-driven-development-SDD-/specs/105-perfil-comunicacion/spec.md) (FR-001, FR-002, FR-006)       |
| Depende de | `auth` (auditoría, decoradores), `common/storage` (bucket), API pública de ARASAAC                                              |
| Tabla      | `Pictogram`                                                                                                                     |
| Lo usan    | `categories` (`PictogramsRepository`, `toPictogramView`), `vocabulary` (mapper, `toPictogramView`), `prisma/vocabulary.seed.ts` |
| Pruebas    | [`test/pictograms.e2e-spec.ts`](../../test/pictograms.e2e-spec.ts)                                                              |

## Reglas de negocio

| Regla                                                                                                                                  | Origen                         | Dónde se cumple                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| El servidor guarda una copia de cada imagen de ARASAAC (PNG 500 px)                                                                    | 105 FR-001                     | `ImportArasaacPictogramUseCase`                                                                             |
| La base guarda **solo el path** (`pictograms/arasaac/2248.png`); la URL se firma al leer (1 h)                                         | 105 FR-006                     | `Pictogram.imagePath`, `application/pictogram-view.ts`                                                      |
| Importar es idempotente (201 nuevo, 200 si ya existía)                                                                                 | 105                            | `findPictogramByArasaacId`                                                                                  |
| Búsqueda en ARASAAC cacheada 24 h y paginada; si ARASAAC no responde, devuelve los guardados con aviso                                 | 105 plan y criterios           | `ArasaacHttpClient`, `SearchArasaacUseCase`                                                                 |
| Imagen propia: PNG o JPEG de hasta 1 MB, verificada por sus bytes                                                                      | Acuerdo 2026-10-21             | `detectImageType`, `UploadPictogramUseCase`                                                                 |
| Nada se borra: se desactiva; lo inactivo no llega a la tableta                                                                         | Acuerdo 2026-10-21             | `Pictogram.edit({ active })`                                                                                |
| Solo las terapeutas los editan; todo se audita                                                                                         | Acuerdos, 109                  | `@Auth(Role.THERAPIST)`, `PICTOGRAM_CREATE` / `PICTOGRAM_UPDATE`                                            |
| Tipo de palabra (persona, acción, cosa, descriptor, social, otra): de ARASAAC al importar, editable; las fotos propias, sin clasificar | 105 FR-012, acuerdo 2026-10-25 | `wordTypeFromArasaac`, `Pictogram.edit({ wordType })`; relleno inicial: `node dist/scripts/fill-word-types` |
| Editar un pictograma sube la versión de los perfiles que lo tienen: la tableta lo baja                                                 | 105 FR-012                     | `UpdatePictogramUseCase`, `touchBoards`                                                                     |

## Estructura

```
pictograms/
├── pictograms.module.ts                 exporta PictogramsRepository, ArasaacClient, ImportArasaacPictogramUseCase
├── domain/
│   ├── entities/pictogram.entity.ts     fromArasaac / uploaded / edit + detectImageType
│   ├── exceptions/pictograms.exceptions.ts
│   └── ports/pictograms.repository.ts   PictogramsRepository + ArasaacClient
├── application/                         search, search-arasaac, import-arasaac, upload, update + pictogram-view.ts
└── infrastructure/
    ├── http/                            pictograms.controller.ts, pictograms.dto.ts
    ├── prisma/                          repositorio + mapper (el mapper lo reutilizan categories y vocabulary)
    └── arasaac/arasaac-http.client.ts   fetch a api.arasaac.org con caché de 24 h
```

## Endpoints

Todos con `@Auth(Role.THERAPIST)`. Listados paginados (`?page=&limit=`).

| Método y ruta                | Respuesta                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /pictograms?q=`         | Página de guardados (`q` opcional) con `imageUrl` firmada                                                                          |
| `GET /pictograms/arasaac?q=` | Página `{ arasaacAvailable, items: [{ arasaacId, label, previewUrl, saved }] }`; si ARASAAC no responde, `items` son los guardados |
| `POST /pictograms/arasaac`   | `{ arasaacId, label? }` → `201` nuevo / `200` existente / `404 ArasaacPictogramNotFound` / `400 ArasaacUnavailable`                |
| `POST /pictograms`           | multipart `label` + `image` → `201` / `400 InvalidImage`                                                                           |
| `PATCH /pictograms/:id`      | `{ label?, active? }`                                                                                                              |

## Para agentes de IA

- Nunca guardes URLs en la base: solo el path; firma al responder con `toPictogramView`.
- ARASAAC se llama solo desde la API (caché y un único punto de falla).
- Desactivar, no borrar. Límite conocido (`ponytail:` en el cliente): la caché es en memoria; pasa a Redis con la spec 106.
