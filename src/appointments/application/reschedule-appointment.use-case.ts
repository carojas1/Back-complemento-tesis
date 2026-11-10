import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { AppointmentChanges } from '../domain/entities/appointment.entity';
import { AppointmentClosed, AppointmentNotFound } from '../domain/exceptions/appointments.exceptions';
import { AppointmentsRepository } from '../domain/ports/appointments.repository';
import { Actor, assertBookable, assertOwnAppointment, auditAppointment } from './appointment-rules';
import { GetAppointmentUseCase } from './get-appointment.use-case';

// Moves, reassigns or edits a scheduled appointment; a closed one answers 409. A specialist only moves their own and never hands
// them over. Editing only the notes re-checks nothing: an unassigned patient must not block fixing a typo.
@Injectable()
export class RescheduleAppointmentUseCase {
  constructor(
    private readonly repo: AppointmentsRepository,
    private readonly audit: AuthAuditLog,
    private readonly getAppointment: GetAppointmentUseCase,
  ) {}

  async execute(id: string, changes: AppointmentChanges, actor: Actor) {
    const appointment = await this.repo.find(id);
    if (!appointment) throw new AppointmentNotFound();
    assertOwnAppointment(appointment.therapistId, actor);
    assertOwnAppointment(changes.therapistId, actor);
    appointment.change(changes);
    const moved = ['therapistId', 'startsAt', 'endsAt', 'roomId'].some((field) => field in changes);
    if (moved) await assertBookable(this.repo, appointment, actor);
    if (!(await this.repo.update(appointment))) throw new AppointmentClosed();
    await auditAppointment(
      this.audit,
      this.repo,
      { action: 'APPOINTMENT_UPDATE', summary: { fields: Object.keys(changes) } },
      appointment,
      actor,
    );
    return this.getAppointment.execute(id, actor);
  }
}
