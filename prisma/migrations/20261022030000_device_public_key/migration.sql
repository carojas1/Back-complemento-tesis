-- Spec 103 FR-005: llave pública de la tableta y código con el que se registró.
-- AlterTable
ALTER TABLE "Device" ADD COLUMN "publicKey" TEXT NOT NULL,
ADD COLUMN "registrationCodeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Device_registrationCodeId_key" ON "Device"("registrationCodeId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_registrationCodeId_fkey" FOREIGN KEY ("registrationCodeId") REFERENCES "DeviceRegistrationCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
