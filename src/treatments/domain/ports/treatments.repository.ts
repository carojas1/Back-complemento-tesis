import { Page, PageRequest } from '../../../common/pagination/page';

export interface TreatmentPlanView {
  patientId: string;
  prescribedSessions: number;
  notes: string | null;
  updatedAt: Date;
}

// One row of the treatment board: where each patient stands. Sessions completed come from the agenda.
export interface TreatmentProgress {
  patientId: string;
  code: string;
  avatarId: string;
  status: 'ACTIVE' | 'DISCHARGED';
  // Only for the assigned specialist: the admin never sees names in shared screens (spec 102).
  name: string | null;
  specialists: { id: string; name: string; specialty: string | null }[];
  prescribedSessions: number | null;
  completedSessions: number;
  scheduledSessions: number;
  missedSessions: number;
  nextAppointment: { startsAt: Date; therapistName: string; roomName: string | null } | null;
  lastSessionAt: Date | null;
  practiceMinutesLast30Days: number;
}

export interface ProgressFilter {
  search?: string;
  therapistId?: string;
  specialty?: string;
  status?: 'ACTIVE' | 'DISCHARGED';
  includeNames: boolean;
}

// Runs under RLS: everything stays inside the center of the request.
export abstract class TreatmentsRepository {
  abstract getPlan(patientId: string): Promise<TreatmentPlanView | null>;
  abstract savePlan(
    patientId: string,
    plan: { prescribedSessions: number; notes: string | null },
    updatedBy: string,
  ): Promise<TreatmentPlanView>;
  abstract isAssigned(patientId: string, therapistId: string): Promise<boolean>;
  abstract patientCode(patientId: string): Promise<string | null>;
  abstract progress(filter: ProgressFilter, page: PageRequest, now: Date): Promise<Page<TreatmentProgress>>;
}
