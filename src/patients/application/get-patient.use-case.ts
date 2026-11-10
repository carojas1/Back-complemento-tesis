import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientNotFound } from '../domain/exceptions/patients.exceptions';
import { PatientsRepository } from '../domain/ports/patients.repository';
import { toPatientView } from './patient-view';

// Full record: assigned therapist only. Every read is audited with the code (spec 104 FR-004).
@Injectable()
export class GetPatientUseCase {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; therapistId: string; ip?: string }) {
    const summary = await this.patients.find(input.id);
    if (!summary) throw new PatientNotFound();
    if (!(await this.patients.isAssigned(input.id, input.therapistId))) throw new PatientNotAssigned();

    await this.audit.record({
      action: 'PATIENT_READ',
      actorType: 'USER',
      actorId: input.therapistId,
      entity: 'Patient',
      entityId: input.id,
      patientCode: summary.patient.code,
      ip: input.ip,
    });
    return toPatientView(summary, this.storage);
  }
}
