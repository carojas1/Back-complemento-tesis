-- Cola de trabajos en segundo plano (PDF del reporte y ZIP de datos). Solo agrega tipos y una tabla nueva.
-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('REPORT_PDF', 'EXPORT_ZIP');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedBy" TEXT NOT NULL,
    "patientId" TEXT,
    "patientCode" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "resultPath" TEXT,
    "fileName" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");

-- CreateIndex
CREATE INDEX "Job_requestedBy_createdAt_idx" ON "Job"("requestedBy", "createdAt");

-- CreateIndex
CREATE INDEX "Job_patientId_idx" ON "Job"("patientId");
