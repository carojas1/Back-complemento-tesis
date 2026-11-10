import { Page, PageRequest } from '../../../common/pagination/page';

// Counters of the center admin's home. Counts and agenda data only, never clinical data (spec 102).
export interface CenterOverview {
  centerName: string;
  therapists: { active: number; inactive: number };
  parents: number;
  patients: { active: number; discharged: number };
  devices: { active: number; stale: number; revoked: number };
  appointmentsToday: { scheduled: number; completed: number; canceled: number; noShow: number };
  appointmentsNext7Days: number;
  openDataRequests: number;
  sessionsLast30Days: number;
  // What the tablets sync (therapy sessions) and the agenda. Counts only.
  attendance: { completed: number; noShow: number; canceled: number };
  therapistLoad: TherapistLoad[];
  followUp: { patientsWithoutTherapist: number; patientsWithoutSessionIn30Days: number };
  sessionsByWeek: { weekStart: string; sessions: number }[];
}

// An active specialist: assigned active patients, therapy sessions in 30 days and scheduled appointments of the next 7 days.
export interface TherapistLoad {
  therapistId: string;
  name: string;
  activePatients: number;
  sessionsLast30Days: number;
  appointmentsNext7Days: number;
}

export interface AnalyticsFilter {
  from: Date;
  to: Date;
  therapistId?: string;
  specialty?: string;
}

export interface AttendanceCounts {
  completed: number;
  noShow: number;
  canceled: number;
}

// Metrics of a period. The attendance rate leaves canceled appointments out: a canceled slot is not a missed session.
export interface CenterAnalytics {
  attendance: AttendanceCounts & { scheduled: number; rate: number | null };
  attendanceByWeek: ({ weekStart: string } & AttendanceCounts)[];
  patientsAttended: number;
  practice: { therapyMinutes: number; homeMinutes: number; sessions: number };
  practiceByWeek: { weekStart: string; therapyMinutes: number; homeMinutes: number }[];
  occupancy: {
    rate: number | null;
    rooms: { roomId: string; name: string; bookedMinutes: number; openMinutes: number; rate: number | null }[];
  };
  bySpecialty: ({ specialty: string } & AttendanceCounts)[];
  byTherapist: ({ therapistId: string; name: string; specialty: string | null; patients: number } & AttendanceCounts)[];
}

export type PatientUsageFlag = 'NO_PRACTICE' | 'NO_SHOWS';
export type PatientUsageSort = 'CODE' | 'MINUTES' | 'LAST_SESSION' | 'NO_SHOWS';

export interface PatientUsageFilter {
  from: Date;
  to: Date;
  therapistId?: string;
  search?: string;
  flag?: PatientUsageFlag;
  sort: PatientUsageSort;
  // Answers of the activities are clinical: only the assigned specialist reads them.
  withResults: boolean;
}

// One patient in a period: how much the app and the agenda were used. Never the diagnosis, the notes or what the patient said.
export interface PatientUsage {
  patientId: string;
  code: string;
  firstNames: string;
  lastNames: string;
  avatarPath: string;
  therapists: string[];
  attendance: AttendanceCounts & { rate: number | null };
  sessions: { therapy: number; home: number };
  minutes: { therapy: number; home: number };
  lastSessionAt: Date | null;
  nextAppointmentAt: Date | null;
  practiceByWeek: { weekStart: string; minutes: number }[];
  correctRate?: number | null;
}

export interface PatientUsagePage extends Page<PatientUsage> {
  // How many patients each filter leaves, so the screen can say it before it is tapped.
  counts: { all: number; noPractice: number; noShows: number };
}

export interface UsagePeriodTotals {
  sessions: number;
  minutes: number;
  practicingPatients: number;
}

// How much the app is used in a period: when, by how many patients, and on which tablets. Counts only.
export interface AppUsage extends UsagePeriodTotals {
  therapy: { sessions: number; minutes: number };
  home: { sessions: number; minutes: number };
  activePatients: number;
  activeDays: number;
  previous: UsagePeriodTotals;
  byDay: { day: string; sessions: number; minutes: number }[];
  // 0 is Sunday, as everywhere in the API; hours are those of Ecuador.
  byHour: { weekday: number; hour: number; sessions: number }[];
  communication: { pictogramsTapped: number; phrasesSpoken: number };
  activityRuns: number;
  // Only the center's admin manages tablets.
  devices?: { deviceId: string; name: string; lastSyncAt: Date | null; sessions: number; minutes: number; stale: boolean }[];
}

export interface AppUsageFilter {
  from: Date;
  to: Date;
  previousFrom: Date;
  therapistId?: string;
  withDevices: boolean;
  staleBefore: Date;
}

// Runs under RLS: the center of the request.
export abstract class DashboardReadModel {
  abstract analytics(filter: AnalyticsFilter): Promise<CenterAnalytics>;
  abstract patientUsage(filter: PatientUsageFilter, page: PageRequest): Promise<PatientUsagePage>;
  abstract appUsage(filter: AppUsageFilter): Promise<AppUsage>;
  abstract centerOverview(range: {
    now: Date;
    dayStart: Date;
    dayEnd: Date;
    weekEnd: Date;
    staleBefore: Date;
    monthAgo: Date;
    // Monday 00:00 (Ecuador time) of each of the last 8 weeks, oldest first, with its 'YYYY-MM-DD' date.
    weeks: { from: Date; weekStart: string }[];
  }): Promise<CenterOverview>;
}
