-- Spec 105 FR-010: actividades configurables por perfil; spec 010: voz del tablero.
ALTER TABLE "Profile" ADD COLUMN "activityPrompts" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Profile" ADD COLUMN "activityRepeatSeconds" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Profile" ADD COLUMN "activityTypes" TEXT[] DEFAULT ARRAY['identify']::TEXT[];
ALTER TABLE "Profile" ADD COLUMN "voice" TEXT NOT NULL DEFAULT 'SYSTEM';

-- Spec 010 FR-004/005: voz clonada del paciente y audio de cada palabra.
CREATE TABLE "Voice" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "consentDate" DATE NOT NULL,
    "samplePath" TEXT NOT NULL,
    "engineVoiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Voice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Voice_patientId_key" ON "Voice"("patientId");
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VoiceClip" (
    "voiceId" TEXT NOT NULL,
    "pictogramId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceClip_pkey" PRIMARY KEY ("voiceId","pictogramId")
);
ALTER TABLE "VoiceClip" ADD CONSTRAINT "VoiceClip_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceClip" ADD CONSTRAINT "VoiceClip_pictogramId_fkey" FOREIGN KEY ("pictogramId") REFERENCES "Pictogram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
