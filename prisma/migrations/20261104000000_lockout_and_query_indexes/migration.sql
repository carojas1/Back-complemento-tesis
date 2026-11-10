-- A login lock belongs to an e-mail and the address it was attacked from: otherwise anyone can lock any known account out.
ALTER TABLE "LoginAttempt" ADD COLUMN "ip" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LoginAttempt" DROP CONSTRAINT "LoginAttempt_pkey";
ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("email", "ip");

-- Indexes for the lists and aggregates that grow with the data. Row-level security filters every query by institution, so they start with it.
CREATE INDEX "Session_homeworkId_idx" ON "Session"("homeworkId");
CREATE INDEX "Session_deviceId_startedAt_idx" ON "Session"("deviceId", "startedAt");
CREATE INDEX "Event_sessionId_type_idx" ON "Event"("sessionId", "type");
CREATE INDEX "AuditLog_institutionId_id_idx" ON "AuditLog"("institutionId", "id" DESC);
CREATE INDEX "Profile_institutionId_syncVersion_id_idx" ON "Profile"("institutionId", "syncVersion", "id");
CREATE INDEX "RetiredPatientCode_institutionId_syncVersion_idx" ON "RetiredPatientCode"("institutionId", "syncVersion");
CREATE INDEX "Patient_institutionId_status_code_idx" ON "Patient"("institutionId", "status", "code");
CREATE INDEX "Pictogram_institutionId_label_id_idx" ON "Pictogram"("institutionId", "label", "id");
