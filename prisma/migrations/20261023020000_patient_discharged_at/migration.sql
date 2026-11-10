-- Spec 104/106: fecha del alta terapéutica; las sesiones que empezaron antes se aceptan al sincronizar.
ALTER TABLE "Patient" ADD COLUMN "dischargedAt" TIMESTAMP(3);
