-- Diagnóstico y condiciones pasan de enum / texto libre a catálogos editables (spec 104 FR-002).
ALTER TABLE "Patient" DROP COLUMN "diagnosis",
DROP COLUMN "diagnosisOther",
DROP COLUMN "associatedConditions",
ADD COLUMN "diagnosisId" TEXT;

-- El tipo enum se borra antes de crear la tabla del mismo nombre.
DROP TYPE "Diagnosis";

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCondition" (
    "patientId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,

    CONSTRAINT "PatientCondition_pkey" PRIMARY KEY ("patientId","conditionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Diagnosis_name_key" ON "Diagnosis"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Condition_name_key" ON "Condition"("name");

-- CreateIndex
CREATE INDEX "PatientCondition_conditionId_idx" ON "PatientCondition"("conditionId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "Diagnosis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCondition" ADD CONSTRAINT "PatientCondition_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCondition" ADD CONSTRAINT "PatientCondition_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valores iniciales: los de la spec 104 y la población del protocolo (Anexo 7).
INSERT INTO "Diagnosis" ("id", "name") VALUES
  (gen_random_uuid()::text, 'Trastorno del lenguaje'),
  (gen_random_uuid()::text, 'Trastorno de los sonidos del habla'),
  (gen_random_uuid()::text, 'Trastorno de la fluidez'),
  (gen_random_uuid()::text, 'Trastorno de la comunicación social');

INSERT INTO "Condition" ("id", "name") VALUES (gen_random_uuid()::text, 'Síndrome de Down');
