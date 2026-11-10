import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { Appointment } from '../domain/entities/appointment.entity';
import { NotAnActiveTherapist } from '../domain/exceptions/appointments.exceptions';
import { AppointmentsRepository } from '../domain/ports/appointments.repository';
import { Actor, assertBookable, assertOwnAppointment, auditAppointment } from './appointment-rules';
import { GetAppointmentUseCase } from './get-appointment.use-case';

type Booking = { patientId: string; therapistId?: string; startsAt: Date; endsAt: Date; roomId?: string | null; notes?: string };

// The admin books for any specialist; a specialist only for themselves (without therapistId, their own is used).
@Injectable()
export class BookAppointmentUseCase {
  constructor(
    private readonly repo: AppointmentsRepository,
    private readonly audit: AuthAuditLog,
    private readonly getAppointment: GetAppointmentUseCase,
  ) {}

  async execute(input: Booking, actor: Actor) {
    assertOwnAppointment(input.therapistId, actor);
    const therapistId = actor.role === Role.THERAPIST ? actor.id : input.therapistId;
    if (!therapistId) throw new NotAnActiveTherapist(); // the admin always picks the specialist
    const appointment = Appointment.book({
      patientId: input.patientId,
      therapistId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      roomId: input.roomId ?? null,
      notes: input.notes ?? null,
      createdBy: actor.id,
    });
    await assertBookable(this.repo, appointment, actor);
    await this.repo.insert(appointment);
    await auditAppointment(
      this.audit,
      this.repo,
      { action: 'APPOINTMENT_CREATE', summary: { startsAt: appointment.startsAt } },
      appointment,
      actor,
    );
    return this.getAppointment.execute(appointment.id, actor);
  }
}
