-- Spec 002/103: el admin define el PIN del Centro al generar el código (solo su hash; se borra al usarse).
ALTER TABLE "DeviceRegistrationCode" ADD COLUMN "centerPin" JSONB;
