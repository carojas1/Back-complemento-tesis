import { Injectable } from '@nestjs/common';
import { AppointmentNotFound } from '../domain/exceptions/appointments.exceptions';
import { AppointmentsRepository } from '../domain/ports/appointments.repository';
import { Actor, assertOwnAppointment } from './appointment-rules';

// One appointment with the patient code and avatar and the specialist name.
@Injectable()
export class GetAppointmentUseCase {
  constructor(private readonly repo: AppointmentsRepository) {}

  async execute(id: string, actor: Actor) {
    const row = await this.repo.findRow(id);
    if (!row) throw new AppointmentNotFound();
    assertOwnAppointment(row.therapistId, actor);
    return row;
  }
}
