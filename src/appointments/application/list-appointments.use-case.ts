import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { PageRequest } from '../../common/pagination/page';
import { AppointmentFilter, AppointmentsRepository } from '../domain/ports/appointments.repository';
import { Actor } from './appointment-rules';

// Center agenda: the admin sees every specialist; a specialist only ever sees their own, whatever the filter says.
@Injectable()
export class ListAppointmentsUseCase {
  constructor(private readonly repo: AppointmentsRepository) {}

  execute(filter: AppointmentFilter, page: PageRequest, actor: Actor) {
    return this.repo.list(actor.role === Role.THERAPIST ? { ...filter, therapistId: actor.id } : filter, page);
  }
}
