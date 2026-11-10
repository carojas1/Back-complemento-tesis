# Módulo `settings`

Configuración del Centro: una sola fila que ajusta el administrador. Hoy guarda el **PIN del Centro** (uno para todas las tabletas), el nombre del Centro, los minutos de inactividad del modo terapeuta y la vigencia del código de registro.

| Dato       | Valor                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Spec       | [002 — PIN y modo terapeuta](../../../caa-spec-driven-development-SDD-/specs/002-pin-modo-terapeuta/spec.md), 103 FR-007/FR-008 |
| Depende de | `auth` (`AuthAuditLog`, regla del PIN)                                                                           |
| Tablas     | `CenterSettings` (id 1)                                                                                          |
| Pruebas    | [`test/devices.e2e-spec.ts`](../../test/devices.e2e-spec.ts)                                                     |

## Endpoints (solo el administrador)

| Método y ruta              | Qué hace                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /settings`            | nombre, `hasCenterPin` (nunca el hash), inactividad del modo terapeuta, vigencia del código            |
| `PATCH /settings`          | `{ centerName?, therapistTimeoutMinutes? (1–30), registrationCodeMinutes? (5–60) }`                    |
| `PUT /settings/center-pin` | `{ currentPin?, pin }`: lo crea o lo cambia (con el actual); `WrongCenterPin` si el actual no coincide |

La tableta baja su parte con `GET /devices/settings` (módulo `devices`): nombre, PIN del Centro cifrado y la inactividad.

## Reglas de negocio

| Regla                                                                                      | Dónde se cumple                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Un solo PIN del Centro para todas las tabletas; la API guarda solo su hash PBKDF2-SHA256   | `SetCenterPinUseCase`, `Pbkdf2CenterPinHasher` |
| El hash usa el mismo formato que verifica la tableta (sal base64, 100 000 vueltas, base64) | `Pbkdf2CenterPinHasher` (= `DeviceKey.pbkdf2`) |
| Cambiar el PIN exige el actual; sin secuencias como 1111 o 1234                            | `WrongCenterPin`, `assertPinPolicy`            |
| Generar un código de tableta exige el PIN del Centro actual                                | `devices` → `CreateRegistrationCodeUseCase`    |
| Todo cambio se audita (`SETTINGS_UPDATE`, `CENTER_PIN_SET`)                                | casos de uso                                   |

## Logo del Centro

`PUT /settings/logo` (solo administrador, campo multipart `logo`) acepta PNG o JPG de hasta 500 KB y 2048 px por lado. El tipo se verifica por los bytes, el nombre lo pone el servidor, y SVG se rechaza porque puede llevar scripts. `DELETE /settings/logo` lo quita. `GET /settings/branding` entrega nombre y logo al personal. Cada cambio se audita (`CENTER_LOGO_SET`, `CENTER_LOGO_REMOVE`) y `GET /devices/settings` no cambia.
