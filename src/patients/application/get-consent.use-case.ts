import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientNotFound } from '../domain/exceptions/patients.exceptions';
import { ConsentVault, PatientsRepository } from '../domain/ports/patients.repository';

// The consent photo, decrypted by the API: the admin or an assigned therapist. Every download is audited.
@Injectable()
export class GetConsentUseCase {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly vault: ConsentVault,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; actorId: string; actorRole: Role; ip?: string }) {
    const summary = await this.patients.find(input.id);
    if (!summary) throw new PatientNotFound();
    if (input.actorRole !== Role.ADMIN && !(await this.patients.isAssigned(input.id, input.actorId))) throw new PatientNotAssigned();

    await this.audit.record({
      action: 'CONSENT_READ',
      actorType: 'USER',
      actorId: input.actorId,
      entity: 'Patient',
      entityId: input.id,
      patientCode: summary.patient.code,
      ip: input.ip,
    });
    return this.vault.read(summary.patient.consentFilePath);
  }
}
