import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientStatus } from '../domain/entities/patient.entity';
import { PatientsRepository } from '../domain/ports/patients.repository';
import { toPatientSummaryView } from './patient-view';

// The admin sees everyone (without clinical data) and can filter those of a therapist or those without one (spec 102); the
// therapist, only her assigned patients (agreed 2026-10-21).
@Injectable()
export class ListPatientsUseCase {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(
    input: { actorId: string; actorRole: Role; search?: string; status?: PatientStatus; assignedTo?: string; notAssignedTo?: string },
    page: PageRequest,
  ) {
    const admin = input.actorRole === Role.ADMIN;
    const therapistId = admin ? input.assignedTo : input.actorId;
    const excludeTherapistId = admin ? input.notAssignedTo : undefined;
    const search = input.search?.trim() || undefined;
    const result = await this.patients.list({ search, status: input.status, therapistId, excludeTherapistId }, page);
    return mapPage(result, (summary) => toPatientSummaryView(summary, this.storage));
  }
}
