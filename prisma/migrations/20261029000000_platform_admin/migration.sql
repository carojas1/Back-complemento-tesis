-- Administración de la plataforma: revisión de solicitudes, perfil y límites del centro, notificaciones de los paneles
-- y la agenda de cada centro.

-- AlterEnum
ALTER TYPE "InstitutionRequestStatus" ADD VALUE 'IN_REVIEW' BEFORE 'APPROVED';

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('PLATFORM', 'INSTITUTION');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "Institution"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "maxTherapists" INTEGER,
  ADD COLUMN "maxDevices" INTEGER,
  ADD COLUMN "suspendedReason" VARCHAR(500),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "InstitutionRequest"
  ADD COLUMN "contactedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNotes" VARCHAR(2000);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT DEFAULT current_institution(),
    "audience" "NotificationAudience" NOT NULL,
    "type" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL DEFAULT current_institution(),
    "patientId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "room" VARCHAR(60),
    "notes" VARCHAR(500),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Appointment_period_check" CHECK ("endsAt" > "startsAt")
);

-- CreateIndex
CREATE INDEX "Notification_audience_institutionId_createdAt_idx" ON "Notification"("audience", "institutionId", "createdAt");
CREATE INDEX "Appointment_institutionId_startsAt_idx" ON "Appointment"("institutionId", "startsAt");
CREATE INDEX "Appointment_therapistId_startsAt_idx" ON "Appointment"("therapistId", "startsAt");
CREATE INDEX "Appointment_patientId_startsAt_idx" ON "Appointment"("patientId", "startsAt");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (spec 113). El rol de la API:
--   * Appointment: acceso completo dentro de su centro.
--   * Notification: lee las filas de su centro y las marca leídas; la plataforma las inserta como dueña de la tabla.
GRANT SELECT, INSERT, UPDATE, DELETE ON "Appointment" TO necon_app;
GRANT SELECT, UPDATE ON "Notification" TO necon_app;
REVOKE INSERT, DELETE ON "Notification" FROM necon_app;

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_isolation ON "Appointment" TO necon_app
  USING ("institutionId" = current_institution()) WITH CHECK ("institutionId" = current_institution());

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_isolation ON "Notification" TO necon_app
  USING ("institutionId" = current_institution() OR ("institutionId" IS NULL AND current_institution() IS NULL))
  WITH CHECK ("institutionId" = current_institution() OR ("institutionId" IS NULL AND current_institution() IS NULL));
