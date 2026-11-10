import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { PageRequest } from '../../common/pagination/page';
import { TreatmentsRepository } from '../domain/ports/treatments.repository';

type Filter = { search?: string; therapistId?: string; specialty?: string; status?: 'ACTIVE' | 'DISCHARGED' };

// The admin sees every patient by code; a specialist only their own, whatever the filter says, and by name.
@Injectable()
export class ListTreatmentProgressUseCase {
  constructor(private readonly repo: TreatmentsRepository) {}

  execute(filter: Filter, page: PageRequest, actor: { id: string; role: Role }) {
    const isSpecialist = actor.role === Role.THERAPIST;
    return this.repo.progress(
      { ...filter, therapistId: isSpecialist ? actor.id : filter.therapistId, includeNames: isSpecialist },
      page,
      new Date(),
    );
  }
}
