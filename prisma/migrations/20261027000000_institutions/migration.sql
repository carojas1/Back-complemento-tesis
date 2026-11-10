-- Spec 113: varias instituciones en una sola base (modelo pool) con RLS de PostgreSQL como segundo candado.

-- Institución de la conexión: la fija la API al tomar una conexión del pool (src/prisma/prisma.service.ts); vacía = ninguna.
CREATE FUNCTION current_institution() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.institution_id', true), '') $$;

-- CreateEnum
CREATE TYPE "InstitutionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruc" TEXT,
    "city" TEXT,
    "kind" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionRequest" (
    "id" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "approxPatients" INTEGER NOT NULL,
    "message" VARCHAR(1000),
    "privacyVersion" TEXT NOT NULL,
    "privacyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "status" "InstitutionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" VARCHAR(1000),
    "institutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstitutionRequest_pkey" PRIMARY KEY ("id")
);

-- Los datos actuales pasan a la institución «Centro», que además es la plantilla de los catálogos de las nuevas.
INSERT INTO "Institution" ("id", "name") SELECT '00000000-0000-4000-8000-000000000001', COALESCE((SELECT "centerName" FROM "CenterSettings" LIMIT 1), 'Centro');

-- DropIndex
DROP INDEX "Avatar_name_key";

-- DropIndex
DROP INDEX "Category_name_key";

-- DropIndex
DROP INDEX "Condition_name_key";

-- DropIndex
DROP INDEX "Diagnosis_name_key";

-- DropIndex
DROP INDEX "Patient_code_key";

-- DropIndex
DROP INDEX "Pictogram_arasaacId_key";

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "ActivityResult" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "ActivityRun" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "institutionId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Avatar" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "CategoryPictogram" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "CenterSettings" DROP CONSTRAINT "CenterSettings_pkey",
DROP COLUMN "id",
ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ADD COLUMN     "lastPatientNumber" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "CenterSettings_pkey" PRIMARY KEY ("institutionId");

-- AlterTable
ALTER TABLE "Condition" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "DataRequest" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "DeviceRegistrationCode" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Diagnosis" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "GlobalSyncVersion" DROP CONSTRAINT "GlobalSyncVersion_pkey",
DROP COLUMN "id",
ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ADD CONSTRAINT "GlobalSyncVersion_pkey" PRIMARY KEY ("institutionId");

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "GuardianPatient" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Homework" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "HomeworkPictogram" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "PatientCondition" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Pictogram" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "ProfileCategory" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "ProfilePictogram" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "RetiredPatientCode" DROP CONSTRAINT "RetiredPatientCode_pkey",
ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ADD CONSTRAINT "RetiredPatientCode_pkey" PRIMARY KEY ("institutionId", "code");

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "TherapistPatient" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "institutionId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Voice" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "VoiceClip" ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- CreateIndex
CREATE UNIQUE INDEX "Institution_ruc_key" ON "Institution"("ruc");

-- CreateIndex
CREATE INDEX "InstitutionRequest_status_createdAt_idx" ON "InstitutionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_institutionId_createdAt_idx" ON "AuditLog"("institutionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_institutionId_name_key" ON "Avatar"("institutionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_institutionId_name_key" ON "Category"("institutionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Condition_institutionId_name_key" ON "Condition"("institutionId", "name");

-- CreateIndex
CREATE INDEX "DataRequest_institutionId_status_idx" ON "DataRequest"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Device_institutionId_idx" ON "Device"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Diagnosis_institutionId_name_key" ON "Diagnosis"("institutionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_institutionId_code_key" ON "Patient"("institutionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Pictogram_institutionId_arasaacId_key" ON "Pictogram"("institutionId", "arasaacId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_institutionId_email_key" ON "User"("institutionId", "email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las filas existentes ya quedaron en «Centro»; las nuevas toman la institución de la conexión.
ALTER TABLE "ActivityResult" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "ActivityRun" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "AuditLog" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Avatar" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Category" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "CategoryPictogram" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "CenterSettings" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Condition" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "DataRequest" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Device" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "DeviceRegistrationCode" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Diagnosis" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Event" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "GlobalSyncVersion" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Goal" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "GuardianPatient" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Homework" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "HomeworkPictogram" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Job" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Note" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Patient" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "PatientCondition" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Pictogram" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Profile" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "ProfileCategory" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "ProfilePictogram" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "RetiredPatientCode" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Session" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "TherapistPatient" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "User" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "Voice" ALTER COLUMN "institutionId" SET DEFAULT current_institution();
ALTER TABLE "VoiceClip" ALTER COLUMN "institutionId" SET DEFAULT current_institution();

INSERT INTO "CenterSettings" ("institutionId") VALUES ('00000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO "GlobalSyncVersion" ("institutionId") VALUES ('00000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
UPDATE "CenterSettings" SET "lastPatientNumber" = (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM "patient_code_seq");
DROP SEQUENCE "patient_code_seq";

-- Rol de la API (FR-003): sin BYPASSRLS y sin ser dueño de las tablas, así la RLS siempre aplica. La API entra con el
-- dueño y cambia a este rol con SET ROLE en cada conexión de una petición. Los roles son de todo el servidor: la base
-- de pruebas lo reutiliza.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'necon_app') THEN
    CREATE ROLE necon_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT necon_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO necon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO necon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO necon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO necon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO necon_app;
REVOKE ALL ON "_prisma_migrations" FROM necon_app;
REVOKE UPDATE, DELETE ON "AuditLog" FROM necon_app; -- spec 109: solo inserción
REVOKE INSERT, UPDATE, DELETE ON "Institution" FROM necon_app; -- la crea y la cambia la plataforma
REVOKE ALL ON "InstitutionRequest" FROM necon_app; -- solo el super administrador, con el dueño

-- Una política por tabla de un centro: se lee y se escribe solo la institución de la conexión. El usuario y la
-- auditoría aceptan además filas sin institución cuando la conexión no tiene ninguna (super administrador, plataforma).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'institutionId' AND table_name <> 'InstitutionRequest' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF t IN ('User', 'AuditLog') THEN
      EXECUTE format('CREATE POLICY institution_isolation ON %I TO necon_app '
        'USING ("institutionId" = current_institution() OR ("institutionId" IS NULL AND current_institution() IS NULL)) '
        'WITH CHECK ("institutionId" = current_institution() OR ("institutionId" IS NULL AND current_institution() IS NULL))', t);
    ELSE
      EXECUTE format('CREATE POLICY institution_isolation ON %I TO necon_app '
        'USING ("institutionId" = current_institution()) WITH CHECK ("institutionId" = current_institution())', t);
    END IF;
  END LOOP;
END $$;
ALTER TABLE "Institution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_isolation ON "Institution" TO necon_app USING ("id" = current_institution());
ALTER TABLE "InstitutionRequest" ENABLE ROW LEVEL SECURITY;
