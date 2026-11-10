# Módulo `profiles`

Perfil de comunicación de cada paciente: qué pictogramas ve, en qué cuadrícula, con qué nivel y a qué velocidad habla la tableta. Se copia de la plantilla del Centro (las categorías y pictogramas de `vocabulary`) al registrar al paciente y después lo ajusta su terapeuta.

| Dato       | Valor                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec       | [105 — Perfil de comunicación](../../../caa-spec-driven-development-SDD-/specs/105-perfil-comunicacion/spec.md), 010 (ajustes del paciente)                                                      |
| Depende de | `auth`; puerto `PatientAccess` (terapeuta asignada)                                                                                                                               |
| Tablas     | `Profile`, `ProfileCategory`, `ProfilePictogram`, `GlobalSyncVersion`                                                                                                             |
| Pruebas    | [`test/patients.e2e-spec.ts`](../../test/patients.e2e-spec.ts), [`test/board.e2e-spec.ts`](../../test/board.e2e-spec.ts) y [`test/sync.e2e-spec.ts`](../../test/sync.e2e-spec.ts) |

## Endpoints (terapeuta asignada, desde el panel; acuerdo 2026-10-23)

| Método y ruta                                                                   | Cuerpo / qué hace                                                                                                                   |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /patients/:patientId/profile`                                              | lo crea desde la plantilla si falta; cada pictograma trae `audioUrl` y `audioSource`                                                |
| `PATCH /patients/:patientId/profile`                                            | `{ gridSize?, activityLevel?, speechRate?, sentenceBarEnabled?, activityPrompts?, activityRepeatSeconds?, activityTypes?, voice? }` |
| `PATCH …/profile/pictograms/:id`                                                | `{ hidden }`                                                                                                                        |
| `POST …/profile/categories` · `DELETE …/profile/categories/:cid`                | agrega una categoría del catálogo con sus pictogramas activos / la quita                                                            |
| `POST …/profile/categories/:cid/pictograms` · `DELETE …/profile/pictograms/:id` | agrega un pictograma del catálogo al final / lo quita (y su grabación)                                                              |
| `PUT` · `DELETE …/profile/pictograms/:id/recording`                             | grabación de la terapeuta (multipart `audio`, m4a ≤ 200 KB)                                                                         |

## Reglas de negocio

| Regla                                                                                                        | Dónde se cumple                                |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Cuadrícula 4/6/9/12, nivel 1–3, velocidad 0.5–1.5                                                            | `Profile.edit()`                               |
| Cada cambio sube la **versión global**: la tableta baja solo lo cambiado (`since`)                           | `ProfilesRepository.saveSettings` / `touch`    |
| Ocultar un pictograma no lo borra del perfil (la terapeuta puede volver a mostrarlo)                         | `setPictogramHidden`                           |
| Las imágenes salen con URL firmada del bucket                                                                | `profile-view.ts`                              |
| Cambiar el perfil se audita (`PROFILE_UPDATE`)                                                               | `update-profile.use-case.ts`                   |
| De 5 a 20 consignas, de 5 a 60 segundos para repetir; tipos de actividad conocidos (vacío = sin actividades) | `Profile.edit()` (FR-010)                      |
| La voz clonada solo se elige si está lista                                                                   | `ClonedVoiceNotReady`                          |
| Audio de cada pictograma: grabación de la terapeuta > voz clonada (si el perfil la usa) > nada               | `profile-view.ts` (FR-011)                     |
| Editar el tablero copia del catálogo; nunca toca el catálogo del Centro                                      | `EditBoardUseCase` (FR-009)                    |
| Cada pictograma guarda su uso (`useCount`, `daysUsed`, `lastUsedAt`) para "Más usados"; lo recalcula `sync`  | spec 105 FR-008, `SyncRepository.refreshUsage` |

## Para agentes de IA

- La tableta no usa estos endpoints: baja los perfiles con `GET /sync/profiles` (módulo `sync`).
- La voz clonada vive en el módulo `voices`; el perfil solo la elige (`voice`) y entrega sus audios.
