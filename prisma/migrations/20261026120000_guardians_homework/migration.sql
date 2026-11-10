-- Representantes y deberes (spec 112): rol PARENT, vínculo representante ↔ paciente, deberes, práctica en casa como
-- sesión HOME (sin tableta) y observaciones compartidas con la familia. Solo agrega: ningún dato existente cambia.
-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('THERAPY', 'HOME');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PARENT';

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "sharedWithFamily" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "guardianId" TEXT,
ADD COLUMN     "homeworkId" TEXT,
ADD COLUMN     "kind" "SessionKind" NOT NULL DEFAULT 'THERAPY',
ALTER COLUMN "deviceId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GuardianPatient" (
    "guardianId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianPatient_pkey" PRIMARY KEY ("guardianId","patientId")
);

-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "instructions" VARCHAR(2000) NOT NULL,
    "dueDate" DATE,
    "withActivity" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkPictogram" (
    "homeworkId" TEXT NOT NULL,
    "pictogramId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "HomeworkPictogram_pkey" PRIMARY KEY ("homeworkId","pictogramId")
);

-- CreateIndex
CREATE INDEX "GuardianPatient_patientId_idx" ON "GuardianPatient"("patientId");

-- CreateIndex
CREATE INDEX "Homework_patientId_createdAt_idx" ON "Homework"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "HomeworkPictogram_pictogramId_idx" ON "HomeworkPictogram"("pictogramId");

-- AddForeignKey
ALTER TABLE "GuardianPatient" ADD CONSTRAINT "GuardianPatient_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianPatient" ADD CONSTRAINT "GuardianPatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkPictogram" ADD CONSTRAINT "HomeworkPictogram_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkPictogram" ADD CONSTRAINT "HomeworkPictogram_pictogramId_fkey" FOREIGN KEY ("pictogramId") REFERENCES "Pictogram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

