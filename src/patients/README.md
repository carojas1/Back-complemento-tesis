# Módulo `patients`

Ficha mínima del paciente. El **administrador** la registra con los datos básicos, el avatar, las terapeutas asignadas y la **foto del consentimiento firmado**; la **terapeuta asignada** la ve, la edita y da el alta. La tableta nunca ve nombres: solo código y avatar.

| Dato       | Valor                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- |
| Spec       | [104 — Pacientes](../../../caa-spec-driven-development-SDD-/specs/104-pacientes/spec.md), acuerdo 2026-10-23 |
| Depende de | `auth`, `catalogs` (`CatalogsRepository`), `profiles` (crea el perfil), `common/storage`      |
| Tablas     | `Patient` (código de la secuencia `patient_code_seq`), `TherapistPatient`, `PatientCondition` |
| Pruebas    | [`test/patients.e2e-spec.ts`](../../test/patients.e2e-spec.ts)                                |
| Secreto    | `CONSENT_ENCRYPTION_KEY` (32 bytes en base64; nunca en git)                                   |

## Endpoints

| Método y ruta                                                     | Quién                      | Respuesta                                                                                                                                                  |
| ----------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /patients` (multipart)                                      | admin                      | `201 { id, code: "P-0001", … }` / `400 ConsentRequired` / `400 UnknownTherapists`                                                                          |
| `GET /patients?page&limit&search&status&assignedTo&notAssignedTo` | admin y terapeuta          | admin: todos, sin datos clínicos (`assignedTo`/`notAssignedTo` = id de una terapeuta o de un representante: sus pacientes o hijos, o los que aún no tiene); terapeuta: solo los asignados |
| `GET /patients/:id`                                               | terapeuta asignada         | ficha completa; audita `PATIENT_READ`                                                                                                                      |
| `PATCH /patients/:id`                                             | terapeuta asignada         | nombres, fecha, representante, avatar, diagnóstico, condiciones                                                                                            |
| `POST /patients/:id/discharge` · `/reactivate`                    | terapeuta asignada         | alta reversible (`dischargedAt`)                                                                                                                           |
| `GET /patients/:id/consent`                                       | admin y terapeuta asignada | la imagen descifrada; audita `CONSENT_READ`                                                                                                                |

Multipart de `POST /patients`: `firstNames`, `lastNames`, `birthDate`, `guardianName`, `guardianPhone`, `consentDate`, `avatarId`, `therapistIds` (separados por comas o repetidos) y `consentImage` (JPG o PNG ≤ 5 MB).

## Reglas de negocio

| Regla                                                                                          | Dónde se cumple                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Sin foto del consentimiento no hay paciente (LOPDP)                                            | `ConsentRequired` en `create-patient.use-case.ts` |
| La foto se guarda **cifrada** con AES-256-GCM (`iv`, `tag` y datos juntos) en el bucket        | `EncryptedConsentVault`                           |
| El código sale de una secuencia de Postgres: nunca se repite ni depende de los nombres         | `PatientsPrismaRepository.nextCode`               |
| El avatar, el diagnóstico y las condiciones **nuevos** deben estar activos en su catálogo      | `UnknownCatalogValue`                             |
| Al registrar se crea su perfil de comunicación desde la plantilla del Centro                   | `CreateProfileFromTemplateUseCase` (`profiles`)   |
| Un paciente dado de alta deja de bajar a la tableta; lo ya registrado antes del alta se acepta | `sync` (`dischargedAt`)                           |
| Ver la ficha o el consentimiento se audita con el código del paciente, no con su nombre        | `AuthAuditLog` (`patientCode`)                    |

## Para agentes de IA

- Nunca devolver nombres ni datos clínicos a la tableta ni en `GET /patients` del admin.
- `CONSENT_ENCRYPTION_KEY` cambia = los consentimientos guardados no se pueden leer. No rotarla sin recifrar.
