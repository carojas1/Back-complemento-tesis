import { FileStorage } from '../../common/storage/file-storage';
import { Patient } from '../domain/entities/patient.entity';
import { PatientAdministrativeFacts, PatientSummary } from '../domain/ports/patients.repository';

const day = (date: Date) => date.toISOString().slice(0, 10);

// List (admin and therapist): no clinical data.
export async function toPatientSummaryView({ patient, avatarPath, therapists }: PatientSummary, storage: FileStorage) {
  const { id, code, firstNames, lastNames, status } = patient;
  return { id, code, firstNames, lastNames, status, avatarUrl: await storage.signedUrl(avatarPath), therapists };
}

// The administration's read: what it registered itself and which tablets were used. No diagnosis, conditions or session content (spec 102).
export function toPatientAdministrativeView(patient: Patient, facts: PatientAdministrativeFacts) {
  return {
    birthDate: day(patient.birthDate),
    guardianName: patient.guardianName,
    guardianPhone: patient.guardianPhone,
    consentDate: day(patient.consentDate),
    dischargedAt: patient.dischargedAt,
    registeredAt: facts.registeredAt,
    devices: facts.devices,
  };
}

// Full record: for the assigned therapist only.
export async function toPatientView(summary: PatientSummary, storage: FileStorage) {
  const { patient } = summary;
  return {
    ...(await toPatientSummaryView(summary, storage)),
    avatarId: patient.avatarId,
    birthDate: day(patient.birthDate),
    diagnosisId: patient.diagnosisId,
    conditionIds: patient.conditionIds,
    guardianName: patient.guardianName,
    guardianPhone: patient.guardianPhone,
    consentDate: day(patient.consentDate),
    dischargedAt: patient.dischargedAt,
  };
}
