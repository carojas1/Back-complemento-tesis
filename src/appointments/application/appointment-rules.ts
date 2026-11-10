import { Role } from '../../auth/domain/entities/user.entity';
import { AuthAuditEntry, AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { centerDayNumber, centerMinuteOfDay, centerWeekday } from '../../common/time/center-time';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { Appointment } from '../domain/entities/appointment.entity';
// prettier-ignore
import { AppointmentInThePast, NotAnActiveTherapist, NotYourAppointment, OutsideCenterHours, PatientNotAssignedToTherapist, PatientNotBookable, PatientUnavailable, RoomNotBookable, RoomUnavailable, TherapistUnavailable } from '../domain/exceptions/appointments.exceptions';
import { AppointmentsRepository, OpeningHours } from '../domain/ports/appointments.repository';

export type Actor = { id: string; role: Role; ip?: string };

// A specialist only handles their own schedule: an appointment of, or for, another specialist answers 403. The admin handles all.
export function assertOwnAppointment(therapistId: string | undefined, actor: Actor) {
  if (actor.role === Role.THERAPIST && therapistId !== undefined && therapistId !== actor.id) throw new NotYourAppointment();
}

// A center with no hours configured takes any time. Once configured, a day without a row is closed.
function assertWithinHours(hours: OpeningHours[], startsAt: Date, endsAt: Date) {
  if (hours.length === 0) return;
  const day = hours.find((h) => h.weekday === centerWeekday(startsAt));
  const opensInTime = day && centerMinuteOfDay(startsAt) >= day.opensAt;
  const closesInTime = day && centerWeekday(endsAt) === day.weekday && centerMinuteOfDay(endsAt) <= day.closesAt;
  if (!opensInTime || !closesInTime) throw new OutsideCenterHours();
}

// Today or later, active specialist, active patient assigned to them, open center, and nobody busy at that time (back to back is fine). Earlier today is
// allowed, for the patient who arrived without an appointment.
export async function assertBookable(repo: AppointmentsRepository, appointment: Appointment, actor: Actor) {
  const { therapistId, patientId, roomId, startsAt, endsAt, id } = appointment;
  if (centerDayNumber(startsAt) < centerDayNumber(new Date())) throw new AppointmentInThePast();
  if (!(await repo.isActivePatient(patientId))) throw new PatientNotBookable();
  if (!(await repo.isActiveTherapist(therapistId))) throw new NotAnActiveTherapist();
  // A specialist gets 403 for an unassigned patient, as in the rest of the API; the admin is told to assign it.
  if (!(await repo.isAssigned(patientId, therapistId)))
    throw actor.role === Role.THERAPIST ? new PatientNotAssigned() : new PatientNotAssignedToTherapist();
  if (roomId && !(await repo.isActiveRoom(roomId))) throw new RoomNotBookable();
  assertWithinHours(await repo.openingHours(), startsAt, endsAt);
  const clash = await repo.overlaps({ therapistId, patientId, roomId, startsAt, endsAt, exceptId: id });
  if (clash.therapist) throw new TherapistUnavailable();
  if (clash.patient) throw new PatientUnavailable();
  if (clash.room) throw new RoomUnavailable();
}

// Every appointment change goes to the audit log with the patient code (never the name).
export async function auditAppointment(
  audit: AuthAuditLog,
  repo: AppointmentsRepository,
  entry: Pick<AuthAuditEntry, 'action' | 'summary'>,
  appointment: Appointment,
  actor: Actor,
) {
  await audit.record({
    ...entry,
    actorType: 'USER',
    actorId: actor.id,
    entity: 'Appointment',
    entityId: appointment.id,
    ip: actor.ip,
    patientCode: await repo.patientCode(appointment.patientId),
  });
}
