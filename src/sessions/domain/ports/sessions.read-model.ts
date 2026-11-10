import { Page, PageRequest } from '../../../common/pagination/page';

export interface Period {
  from: Date;
  to: Date;
}

// Spec 107: one row per session with its totals, computed from the events (FR-001).
export interface SessionSummary {
  id: string;
  // Spec 112: therapy session (tablet) or home practice (guardian, no tablet or therapist).
  kind: 'THERAPY' | 'HOME';
  guardianName: string | null;
  homeworkId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMin: number | null;
  therapistName: string | null;
  therapistVerified: boolean;
  deviceName: string | null;
  taps: number;
  sentences: number;
  activity: { correct: number; total: number }; // first-attempt correct answers out of the total prompts
}

export interface SessionDetail extends SessionSummary {
  patientId: string;
  patientCode: string;
  events: { occurredAt: Date; type: string; payload: unknown }[];
  results: { answeredAt: Date; target: string; chosen: string; correct: boolean; firstAttempt: boolean; responseMs: number }[];
}

export interface PatientReport {
  sessions: number;
  minutes: number;
  distinctWords: number;
  topWords: { word: string; count: number }[];
  weeks: { week: string; meanSentenceLength: number | null; accuracy: number | null }[];
  // Practice time per week, in the clinic and at home with the tablet.
  practiceByWeek: { week: string; sessions: number; therapyMinutes: number; homeMinutes: number }[];
  staleDevices: number; // tablets unsynced for more than 24 h: the report may be incomplete
}

// What the PDF adds to the indicators (specs 107 and 108): who the patient is and the period's observations and objectives.
export interface ReportContext {
  code: string;
  firstNames: string;
  lastNames: string;
  createdAt: Date;
  notes: { createdAt: Date; authorName: string; text: string }[];
  goals: { createdAt: Date; text: string; status: string; targetDate: Date | null }[];
  prescribedSessions: number | null;
  sessions: { startedAt: Date; minutes: number; kind: string; therapistName: string | null }[];
  appointments: { startsAt: Date; status: string; therapistName: string; roomName: string | null }[];
}

// Full data for the report PDF.
export interface ReportDocumentData {
  centerName: string;
  patient: ReportContext;
  period: Period;
  report: PatientReport;
}

// Draws the PDF (pdfmake adapter in infrastructure).
export abstract class ReportRenderer {
  abstract render(data: ReportDocumentData): Promise<Buffer>;
}

// Read-only over what the tablets uploaded (spec 106).
export abstract class SessionsReadModel {
  abstract list(patientId: string, period: Partial<Period>, page: PageRequest): Promise<Page<SessionSummary>>;
  abstract find(sessionId: string): Promise<SessionDetail | null>;
  abstract report(patientId: string, period: Period): Promise<PatientReport>;
  abstract patientCode(patientId: string): Promise<string | null>;
  // null if the patient does not exist.
  abstract reportContext(patientId: string, period: Period): Promise<ReportContext | null>;
}
