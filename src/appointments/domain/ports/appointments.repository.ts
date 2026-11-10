import { Page, PageRequest } from '../../../common/pagination/page';
import { Appointment, AppointmentStatus } from '../entities/appointment.entity';

export interface AppointmentFilter {
  from?: Date;
  to?: Date;
  therapistId?: string;
  patientId?: string;
  status?: AppointmentStatus;
  specialty?: string;
  roomId?: string;
}

// What the agenda shows: the patient only by code and avatar (the admin never sees clinical data, spec 102).
export interface AppointmentRow extends Appointment {
  patientCode: string;
  patientAvatarId: string;
  therapistName: string;
  therapistSpecialty: string | null;
  roomName: string | null;
}

export interface OpeningHours {
  weekday: number;
  opensAt: number;
  closesAt: number;
}

// Runs under RLS: everything stays inside the center of the request.
export abstract class AppointmentsRepository {
  abstract list(filter: AppointmentFilter, page: PageRequest): Promise<Page<AppointmentRow>>;
  abstract find(id: string): Promise<Appointment | null>;
  abstract findRow(id: string): Promise<AppointmentRow | null>;
  abstract insert(appointment: Appointment): Promise<void>;
  // Only while the appointment is still scheduled: false means someone closed it first.
  abstract update(appointment: Appointment): Promise<boolean>;
  // Another scheduled appointment of the specialist, the patient or the room overlapping [startsAt, endsAt).
  abstract overlaps(input: {
    therapistId: string;
    patientId: string;
    roomId: string | null;
    startsAt: Date;
    endsAt: Date;
    exceptId?: string;
  }): Promise<{ therapist: boolean; patient: boolean; room: boolean }>;
  abstract openingHours(): Promise<OpeningHours[]>;
  abstract isActiveRoom(roomId: string): Promise<boolean>;
  abstract isActiveTherapist(userId: string): Promise<boolean>;
  abstract isActivePatient(patientId: string): Promise<boolean>;
  abstract isAssigned(patientId: string, therapistId: string): Promise<boolean>;
  abstract patientCode(patientId: string): Promise<string | undefined>;
}

// Used by patients and users: a discharge or a deactivation frees the future agenda.
export abstract class FutureAppointmentsCanceller {
  abstract cancelForPatient(patientId: string, now: Date): Promise<number>;
  abstract cancelForTherapist(therapistId: string, now: Date): Promise<number>;
}
