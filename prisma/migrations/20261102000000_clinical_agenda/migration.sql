-- Clinical agenda: specialist specialty, center rooms and opening hours, treatment plans (sessions prescribed per patient),
-- the annual plan of each center, and database guarantees against double booking. Only adds: no column the tablet reads changes.

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'CANCELED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "specialty" VARCHAR(80);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL DEFAULT current_institution(),
    "name" VARCHAR(60) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- One row per open weekday (0 = Sunday), in minutes of the center's local day. A day without a row is closed.
CREATE TABLE "CenterHours" (
    "institutionId" TEXT NOT NULL DEFAULT current_institution(),
    "weekday" INTEGER NOT NULL,
    "opensAt" INTEGER NOT NULL,
    "closesAt" INTEGER NOT NULL,
    CONSTRAINT "CenterHours_pkey" PRIMARY KEY ("institutionId", "weekday"),
    CONSTRAINT "CenterHours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "CenterHours_period_check" CHECK ("opensAt" >= 0 AND "closesAt" <= 1440 AND "opensAt" < "closesAt")
);

CREATE TABLE "TreatmentPlan" (
    "patientId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL DEFAULT current_institution(),
    "prescribedSessions" INTEGER NOT NULL,
    "notes" VARCHAR(500),
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("patientId"),
    CONSTRAINT "TreatmentPlan_prescribed_check" CHECK ("prescribedSessions" BETWEEN 1 AND 500)
);

CREATE TABLE "Subscription" (
    "institutionId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'ANNUAL',
    "priceCents" INTEGER NOT NULL DEFAULT 200,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("institutionId")
);

CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(120),
    "paidAt" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- AlterTable: the free-text room gives way to a real room, so occupancy can be measured.
ALTER TABLE "Appointment" DROP COLUMN "room", ADD COLUMN "roomId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Room_institutionId_name_key" ON "Room"("institutionId", "name");
CREATE INDEX "Appointment_roomId_startsAt_idx" ON "Appointment"("roomId", "startsAt");
CREATE INDEX "Appointment_institutionId_status_startsAt_idx" ON "Appointment"("institutionId", "status", "startsAt");
CREATE INDEX "User_institutionId_specialty_idx" ON "User"("institutionId", "specialty");
CREATE INDEX "TreatmentPlan_institutionId_idx" ON "TreatmentPlan"("institutionId");
CREATE INDEX "SubscriptionPayment_institutionId_paidAt_idx" ON "SubscriptionPayment"("institutionId", "paidAt");
CREATE INDEX "SubscriptionPayment_paidAt_idx" ON "SubscriptionPayment"("paidAt");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Subscription"("institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Double booking is impossible even with two simultaneous requests: the database refuses the overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_therapist_no_overlap"
  EXCLUDE USING gist ("therapistId" WITH =, tsrange("startsAt", "endsAt") WITH &&) WHERE ("status" = 'SCHEDULED');
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patient_no_overlap"
  EXCLUDE USING gist ("patientId" WITH =, tsrange("startsAt", "endsAt") WITH &&) WHERE ("status" = 'SCHEDULED');
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_room_no_overlap"
  EXCLUDE USING gist ("roomId" WITH =, tsrange("startsAt", "endsAt") WITH &&) WHERE ("status" = 'SCHEDULED' AND "roomId" IS NOT NULL);

-- Every existing center starts its annual plan with 30 days of grace.
INSERT INTO "Subscription" ("institutionId", "graceEndsAt", "updatedAt")
  SELECT "id", CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP FROM "Institution";

-- RLS (spec 113). The API role:
--   * Room, CenterHours, TreatmentPlan: full access inside its own center.
--   * Subscription, SubscriptionPayment: read only inside its own center; the platform writes them as table owner.
GRANT SELECT, INSERT, UPDATE, DELETE ON "Room", "CenterHours", "TreatmentPlan" TO necon_app;
GRANT SELECT ON "Subscription", "SubscriptionPayment" TO necon_app;

ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_isolation ON "Room" TO necon_app
  USING ("institutionId" = current_institution()) WITH CHECK ("institutionId" = current_institution());

ALTER TABLE "CenterHours" ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_isolation ON "CenterHours" TO necon_app
  USING ("institutionId" = current_institution()) WITH CHECK ("institutionId" = current_institution());

ALTER TABLE "TreatmentPlan" ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_isolation ON "TreatmentPlan" TO necon_app
  USING ("institutionId" = current_institution()) WITH CHECK ("institutionId" = current_institution());

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_isolation ON "Subscription" TO necon_app USING ("institutionId" = current_institution());

ALTER TABLE "SubscriptionPayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY institution_isolation ON "SubscriptionPayment" TO necon_app USING ("institutionId" = current_institution());
