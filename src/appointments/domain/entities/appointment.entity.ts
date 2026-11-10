import { AppointmentClosed, InvalidAppointmentPeriod } from '../exceptions/appointments.exceptions';

// A therapy appointment in the center's agenda. The admin books for any specialist and a specialist for themselves; either
// closes it (completed, canceled, no-show). A closed appointment never reopens: a new one is booked instead.
export const appointmentStatuses = ['SCHEDULED', 'COMPLETED', 'CANCELED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];
export const closingStatuses = ['COMPLETED', 'CANCELED', 'NO_SHOW'] as const;
export type ClosingStatus = (typeof closingStatuses)[number];

const minute = 60_000;
const minDurationMinutes = 10;
const maxDurationMinutes = 8 * 60;

export interface AppointmentProps {
  id: string;
  patientId: string;
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  roomId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}

export type AppointmentChanges = Partial<Pick<AppointmentProps, 'therapistId' | 'startsAt' | 'endsAt' | 'roomId' | 'notes'>>;

function assertPeriod(startsAt: Date, endsAt: Date) {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / minute;
  if (minutes < minDurationMinutes || minutes > maxDurationMinutes) throw new InvalidAppointmentPeriod();
}

export interface Appointment extends Readonly<AppointmentProps> {}
export class Appointment {
  private constructor(props: AppointmentProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: AppointmentProps) {
    return new Appointment(props);
  }

  static book(input: Pick<AppointmentProps, 'patientId' | 'therapistId' | 'startsAt' | 'endsAt' | 'roomId' | 'notes' | 'createdBy'>) {
    assertPeriod(input.startsAt, input.endsAt);
    return new Appointment({ ...input, id: crypto.randomUUID(), status: 'SCHEDULED', createdAt: new Date() });
  }

  isOpen() {
    return this.status === 'SCHEDULED';
  }

  change(changes: AppointmentChanges) {
    if (!this.isOpen()) throw new AppointmentClosed();
    const next = { ...this.toSnapshot(), ...changes };
    assertPeriod(next.startsAt, next.endsAt);
    Object.assign(this, next);
  }

  close(status: ClosingStatus) {
    if (!this.isOpen()) throw new AppointmentClosed();
    Object.assign(this, { status });
  }

  toSnapshot(): AppointmentProps {
    return { ...this };
  }
}
