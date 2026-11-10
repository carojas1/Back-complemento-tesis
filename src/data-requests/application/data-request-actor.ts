import { Injectable } from '@nestjs/common';
import { AuthAuditEntry, AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { PatientNotFound } from '../../patients/domain/exceptions/patients.exceptions';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { DataRequest } from '../domain/entities/data-request.entity';
import { DataRequestNotFound } from '../domain/exceptions/data-requests.exceptions';
import { DataRequestsRepository, PatientRecords } from '../domain/ports/data-requests.repository';

export type Actor = { userId: string; name?: string; ip?: string };

// What the spec 110 use cases share: finding the request or the patient, requiring the assignment and auditing (T006).
@Injectable()
export class DataRequestSupport {
  constructor(
    readonly requests: DataRequestsRepository,
    readonly patients: PatientRecords,
    private readonly access: PatientAccess,
    private readonly audit: AuthAuditLog,
  ) {}

  async request(id: string) {
    const request = await this.requests.find(id);
    if (!request) throw new DataRequestNotFound();
    return request;
  }

  // Existing patient assigned to the therapist.
  async assignedPatient(patient: { id?: string; code?: string }, actor: Actor) {
    const found = patient.id ? await this.patients.findById(patient.id) : await this.patients.findByCode(patient.code!);
    if (!found) throw new PatientNotFound();
    if (!(await this.access.isAssigned(found.id, actor.userId))) throw new PatientNotAssigned();
    return found;
  }

  record(entry: Omit<AuthAuditEntry, 'actorType' | 'actorId' | 'ip'>, actor: Actor) {
    return this.audit.record({ ...entry, actorType: 'USER', actorId: actor.userId, ip: actor.ip });
  }

  recordRequest(action: AuthAuditEntry['action'], request: DataRequest, actor: Actor, summary: Record<string, unknown> = {}) {
    return this.record(
      {
        action,
        entity: 'DataRequest',
        entityId: request.id,
        patientCode: request.patientCode,
        summary: { type: request.type, ...summary },
      },
      actor,
    );
  }
}
