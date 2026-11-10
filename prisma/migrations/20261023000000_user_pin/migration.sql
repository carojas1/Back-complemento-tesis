-- Spec 002: PIN de tableta por terapeuta, verificado por la API (solo el hash argon2id).
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT,
ADD COLUMN "pinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
