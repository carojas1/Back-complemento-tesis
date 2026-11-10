-- La invitación por correo (INVITE, 48 h) se reemplazó por la clave temporal (spec 102).
ALTER TABLE "PasswordReset" DROP COLUMN "purpose";
DROP TYPE "PasswordResetPurpose";
