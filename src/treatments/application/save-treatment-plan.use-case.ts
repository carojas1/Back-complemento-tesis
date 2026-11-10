import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { PatientNotFound } from '../../patients/domain/exceptions/patients.exceptions';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { TreatmentsRepository } from '../domain/ports/treatments.repository';

// Prescribing sessions is a clinical decision: only a specialist assigned to the patient makes it.
@Injectable()
export class SaveTreatmentPlanUseCase {
  constructor(
    private readonly repo: TreatmentsRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(patientId: string, plan: { prescribedSessions: number; notes?: string }, actor: { id: string; ip?: string }) {
    const patientCode = await this.repo.patientCode(patientId);
    if (patientCode === null) throw new PatientNotFound();
    if (!(await this.repo.isAssigned(patientId, actor.id))) throw new PatientNotAssigned();
    const saved = await this.repo.savePlan(patientId, { prescribedSessions: plan.prescribedSessions, notes: plan.notes ?? null }, actor.id);
    await this.audit.record({
      action: 'TREATMENT_PLAN_CHANGE',
      actorType: 'USER',
      actorId: actor.id,
      entity: 'TreatmentPlan',
      entityId: patientId,
      patientCode,
      ip: actor.ip,
      summary: { prescribedSessions: plan.prescribedSessions },
    });
    return saved;
  }
}
