# Módulo `voices`

Voz clonada de una persona de confianza del paciente (spec 010 FR-004/005). Como la web de `Clonar-voz`: la terapeuta asignada **graba o sube** una muestra de 5 a 15 s (con su transcripción opcional) y confirma el consentimiento escrito; la API la registra una vez como **voz base**. Cuando la terapeuta toca "Generar voces", la API genera en segundo plano el audio de **solo los pictogramas del tablero del paciente** que aún no lo tienen, y la tableta los descarga al sincronizar.

| Dato       | Valor                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Spec       | [010 — Ajustes del perfil y voz del paciente](../../../caa-spec-driven-development-SDD-/specs/010-ajustes-y-grabacion/spec.md), 105 FR-011 |
| Depende de | `auth` (`AuthAuditLog`), `profiles` (`PatientAccess`), `common/storage`                                                     |
| Tablas     | `Voice` (una por paciente), `VoiceClip` (audio por voz y pictograma, con el texto usado)                                    |
| Servicio   | `Clonar-voz` (`~/Documents/tesis/Clonar-voz`, Qwen3-TTS + llama.cpp, local y sin licencias) en `VOICE_CLONE_URL`            |
| Pruebas    | [`test/board.e2e-spec.ts`](../../test/board.e2e-spec.ts) (con un sintetizador de mentira)                                   |

## Endpoints (terapeuta asignada)

| Método y ruta                       | Qué hace                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /patients/:id/voice`           | estado (`PENDING`, `READY`, `FAILED`), quién presta la voz, avance `{ ready, total }`, `missing` (sin audio) y `generating`                       |
| `POST /patients/:id/voice`          | multipart `ownerName`, `relationship`, `consentDate`, `consentConfirmed=true`, `transcript?` y `sample` (wav, mp3, m4a, webm u ogg ≤ 10 MB)       |
| `POST /patients/:id/voice/generate` | 202: encola la generación de los audios que faltan (pictogramas nuevos o renombrados) y devuelve `jobId`; `VoiceNotReady` si la voz no está lista |
| `DELETE /patients/:id/voice`        | borra la muestra y todos sus audios; el tablero vuelve a la voz del sistema                                                                       |

La voz se elige en el perfil con `PATCH /patients/:id/profile { voice: 'CLONED' }` (solo si está `READY`).

## Reglas de negocio

| Regla                                                                                                                                                | Dónde se cumple                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Dato biométrico: sin consentimiento confirmado no se guarda nada (⚑ validar con el asesor legal)                                                     | `VoiceConsentRequired`                                                                                            |
| Una voz por paciente                                                                                                                                 | `VoiceAlreadyExists`                                                                                              |
| Cada palabra se genera una vez y solo a pedido; si la etiqueta cambia, queda en `missing` hasta generar de nuevo                                     | `VoiceClip.text`, `missingClips`, `GenerateVoiceClipsUseCase`                                                     |
| Registrar la voz base y generar los audios pedidos va por la cola de trabajos (carril de voz, aparte del PDF y el ZIP), de a un audio                | `VoiceJobs` encola (`VOICE_REGISTER`, `VOICE_CLIPS`); `VoiceJobRunner` lo hace en el worker (`pnpm start:worker`) |
| Servicio caído: la voz queda `FAILED` al registrarse; al generar, lo hecho queda y el trabajo se reintenta con espera (30 s, 1 min) hasta 3 intentos | `VoiceJobRunner`, `JobsWorker`                                                                                    |
| Un doble toque en "Generar" no encola dos; `generating` y `jobId` salen del trabajo activo (se sigue con `GET /jobs/:id`)                            | `VoiceJobsPrisma.generate`                                                                                        |
| Cada audio nuevo sube la versión del perfil: la tableta lo baja                                                                                      | `touchProfiles`                                                                                                   |
| Cada audio se guarda sin el silencio de los bordes y al volumen parejo (acuerdo 2026-10-25): la frase suena de corrido                               | `WordAudio` (`common/audio`, ffmpeg)                                                                              |
| Un audio de más de 3 s o casi sin voz (< −35 dB) se pide de nuevo, hasta 3 veces; si sigue mal, la palabra queda sin audio y la generación termina   | `VoiceJobRunner.goodWord`, `wordRules`                                                                            |
| Crear y borrar la voz se audita (`VOICE_CREATE`, `VOICE_DELETE`)                                                                                     | casos de uso                                                                                                      |

## Para agentes de IA

- La generación ya no corre en el proceso de la API: sin el worker en marcha los pedidos quedan `QUEUED` (no se pierden).
- Para probar con el servicio real: `cd ~/Documents/tesis/Clonar-voz && .venv/bin/python app.py` (usa GPU por Vulkan si hay; ~5 s por palabra en una RTX 3050). En el espacio de trabajo el servicio está en `caa-voice-cloner` (en CPU, ~18 s por palabra).
- El servicio guarda sus voces en su propia carpeta `voces/`: si se reinstala o se mueve, las voces registradas antes dejan de existir y la generación falla con «La voz de referencia no existe» (2026-10-25: P-0235 y P-0236). Hay que volver a crear la voz desde el panel.
- `node dist/scripts/fix-word-audio [--dry-run]` deja los audios ya guardados como los nuevos (recorte, volumen y los defectuosos a regenerar); se corrió una vez el 2026-10-25.
