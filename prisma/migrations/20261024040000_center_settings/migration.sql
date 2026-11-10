-- Spec 002/103 FR-008: configuración del Centro (una fila) con el PIN del Centro único para todas las tabletas.
ALTER TABLE "DeviceRegistrationCode" DROP COLUMN IF EXISTS "centerPin";

CREATE TABLE "CenterSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "centerName" TEXT NOT NULL DEFAULT 'Centro',
    "centerPin" JSONB,
    "therapistTimeoutMinutes" INTEGER NOT NULL DEFAULT 5,
    "registrationCodeMinutes" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CenterSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CenterSettings_single_row" CHECK ("id" = 1)
);

INSERT INTO "CenterSettings" ("id") VALUES (1);
