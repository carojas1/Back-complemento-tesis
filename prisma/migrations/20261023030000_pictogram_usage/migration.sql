-- Spec 105 FR-008: uso de cada pictograma del perfil (más usados).
ALTER TABLE "ProfilePictogram" ADD COLUMN "useCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProfilePictogram" ADD COLUMN "daysUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProfilePictogram" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
