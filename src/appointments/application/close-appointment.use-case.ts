import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { ClosingStatus } from '../domain/entities/appointment.entity';
import { AppointmentClosed, AppointmentNotFound } from '../domain/exceptions/appointments.exceptions';
import { AppointmentsRepository } from '../domain/ports/appointments.repository';
import { Actor, assertOwnAppointment, auditAppointment } from './appointment-rules';
import { GetAppointmentUseCase } from './get-appointment.use-case';

// Closes an appointment as completed, canceled or no-show. The admin closes any; a specialist, their own.
@Injectable()
export class CloseAppointmentUseCase {
  constructor(
    private readonly repo: AppointmentsRepository,
    private readonly audit: AuthAuditLog,
    private readonly getAppointment: GetAppointmentUseCase,
  ) {}

  async execute(id: string, status: ClosingStatus, actor: Actor) {
    const appointment = await this.repo.find(id);
    if (!appointment) throw new AppointmentNotFound();
    assertOwnAppointment(appointment.therapistId, actor);
    appointment.close(status);
    if (!(await this.repo.update(appointment))) throw new AppointmentClosed();
    await auditAppointment(this.audit, this.repo, { action: 'APPOINTMENT_STATUS', summary: { status } }, appointment, actor);
    return this.getAppointment.execute(id, actor);
  }
}
