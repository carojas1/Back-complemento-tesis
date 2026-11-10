import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { PatientNotFound } from '../../patients/domain/exceptions/patients.exceptions';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { TreatmentsRepository } from '../domain/ports/treatments.repository';

@Injectable()
export class GetTreatmentPlanUseCase {
  constructor(private readonly repo: TreatmentsRepository) {}

  async execute(patientId: string, actor: { id: string; role: Role }) {
    if ((await this.repo.patientCode(patientId)) === null) throw new PatientNotFound();
    if (actor.role === Role.THERAPIST && !(await this.repo.isAssigned(patientId, actor.id))) throw new PatientNotAssigned();
    const plan = await this.repo.getPlan(patientId);
    // The admin reads how many sessions were prescribed; the free text the specialist wrote can be clinical (spec 102).
    return plan && actor.role === Role.ADMIN ? { ...plan, notes: null } : plan;
  }
}
