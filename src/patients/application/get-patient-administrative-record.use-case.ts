import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { anonymousPatientCode } from '../../data-requests/domain/entities/data-request.entity';
import { PatientNotFound } from '../domain/exceptions/patients.exceptions';
import { PatientsRepository } from '../domain/ports/patients.repository';
import { toPatientAdministrativeView } from './patient-view';

// What the center's admin may read of one patient, audited like the full record: never anything clinical (spec 102).
@Injectable()
export class GetPatientAdministrativeRecordUseCase {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; actorId: string; ip?: string }) {
    const summary = await this.patients.find(input.id);
    if (!summary || summary.patient.code === anonymousPatientCode) throw new PatientNotFound();
    const facts = await this.patients.administrativeFacts(input.id);
    if (!facts) throw new PatientNotFound();

    await this.audit.record({
      action: 'PATIENT_READ',
      actorType: 'USER',
      actorId: input.actorId,
      entity: 'Patient',
      entityId: input.id,
      patientCode: summary.patient.code,
      ip: input.ip,
      summary: { administrative: true },
    });
    return toPatientAdministrativeView(summary.patient, facts);
  }
}
