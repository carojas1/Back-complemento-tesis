# Módulo `sessions`

Lectura de las sesiones que suben las tabletas (spec 107) y su PDF con observaciones y objetivos (spec 108): lista con totales, detalle con línea de tiempo y resultados de actividades, e indicadores del periodo. Todo se calcula desde los eventos guardados (FR-001).

| Dato    | Valor                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec    | [107 — Sesiones y reportes](../../../caa-spec-driven-development-SDD-/specs/107-sesiones-y-reportes/spec.md)                                                            |
| Tablas  | `Session`, `Event`, `ActivityRun`, `ActivityResult` (las escribe `sync`)                                                                                 |
| Pruebas | [`test/sessions.e2e-spec.ts`](../../test/sessions.e2e-spec.ts), [`test/data-requests.e2e-spec.ts`](../../test/data-requests.e2e-spec.ts) (PDF y enlaces) |

## Endpoints (terapeuta asignada; cada consulta se audita como `SESSION_READ`)

| Método y ruta                                   | Qué hace                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /patients/:id/sessions?from&to&page&limit` | fecha, duración, terapeuta (y si verificó su PIN), tableta, pictogramas, frases y aciertos al primer intento                                                                                                             |
| `GET /sessions/:id`                             | eventos en orden y resultados de actividades con las palabras pedida y elegida                                                                                                                                           |
| `GET /patients/:id/reports?from&to`             | por defecto 30 días: sesiones, minutos, palabras distintas, top 10, frase media y aciertos por semana, tabletas sin sincronizar hace más de 24 h                                                                         |
| `PDF del reporte` (por la cola, módulo `jobs`)  | `POST /patients/:id/reports/pdf-jobs?from&to` → el worker genera el `application/pdf`: encabezado con el nombre del Centro, código y nombre, periodo, indicadores, barras por semana y top 10, observaciones y objetivos |

## Para agentes de IA

- Aciertos = resultados con `correct` y `firstAttempt` sobre los resultados con `firstAttempt` (cada consigna tiene un primer intento).
- El PDF reutiliza `SessionsUseCases.report` (mismo cálculo y verificación de acceso) y lo dibuja `PdfmakeReportRenderer` (puerto `ReportRenderer`) con las fuentes estándar de PDF y barras vectoriales de `common/pdf`.
- Objetivos del periodo: creados antes del fin y en curso o cambiados dentro del periodo.
- `ReportPdfUseCase` se exporta para la exportación ZIP de la spec 110.
