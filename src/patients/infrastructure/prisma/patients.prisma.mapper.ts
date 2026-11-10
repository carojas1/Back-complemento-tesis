import { Prisma } from '@prisma/client';
import { Patient, PatientProps } from '../../domain/entities/patient.entity';

export const patientInclude = {
  conditions: { select: { conditionId: true } },
  avatar: { select: { imagePath: true } },
  therapists: { select: { therapist: { select: { id: true, name: true } } }, orderBy: { therapistId: 'asc' } },
} satisfies Prisma.PatientInclude;

type Row = Prisma.PatientGetPayload<{ include: typeof patientInclude }>;

// The only place that knows the Prisma shape of the patient.
export class PatientsPrismaMapper {
  static toSummary(row: Row) {
    const conditionIds = row.conditions.map((c) => c.conditionId).sort();
    const patient = Patient.reconstitute({ ...PatientsPrismaMapper.columns(row), conditionIds });
    return { patient, avatarPath: row.avatar.imagePath, therapists: row.therapists.map((t) => t.therapist) };
  }

  // Conditions go in their own table (PatientCondition), not in the patient row.
  static toPrisma(patient: Patient) {
    return PatientsPrismaMapper.columns(patient);
  }

  private static columns(p: Omit<PatientProps, 'conditionIds'>) {
    const { id, code, avatarId, firstNames, lastNames, birthDate, diagnosisId, guardianName, guardianPhone } = p;
    const { consentDate, consentFilePath, status, dischargedAt, createdBy } = p;
    return {
      id,
      code,
      avatarId,
      firstNames,
      lastNames,
      birthDate,
      diagnosisId,
      guardianName,
      guardianPhone,
      consentDate,
      consentFilePath,
      status,
      dischargedAt,
      createdBy,
    };
  }
}
