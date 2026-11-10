import { Page, PageRequest } from '../../../common/pagination/page';
import { LivePatient } from '../live';
// What the tablet uploads (spec 106/009). UUIDs are born on the tablet: the server uses them as the key (constitution §1.3).
export interface SyncSession {
  id: string;
  patientCode: string;
  therapistId?: string | null;
  therapistVerified?: boolean;
  profileVersion: number;
  startedAt: Date;
  endedAt?: Date | null;
  // Home practice (spec 112): the homework item that was practiced. The tablet does not send it.
  homeworkId?: string | null;
}
export interface SyncEvent {
  id: string;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}
export interface SyncActivityRun {
  id: string;
  sessionId: string;
  type: string;
  level: number;
  startedAt: Date;
  endedAt?: Date | null;
}
export interface SyncActivityResult {
  id: string;
  runId: string;
  targetPictogramId: string;
  chosenPictogramId: string;
  correct: boolean;
  firstAttempt: boolean;
  responseMs: number;
  answeredAt: Date;
}
export interface SyncBatch {
  sessions: SyncSession[];
  events: SyncEvent[];
  activityRuns: SyncActivityRun[];
  activityResults: SyncActivityResult[];
}

// Who uploads the batch: a Center tablet (spec 106) or a guardian with home practice (spec 112).
export type BatchSource = { deviceId: string } | { guardianId: string };

// The resolved session: patient by id, therapist verification confirmed by the server, and its origin.
export type SessionRow = Omit<SyncSession, 'patientCode'> & {
  patientId: string;
  therapistVerified: boolean;
  kind: 'THERAPY' | 'HOME';
  deviceId: string | null;
  guardianId: string | null;
  homeworkId: string | null;
};

export interface PatientRef {
  id: string;
  code: string;
  status: 'ACTIVE' | 'DISCHARGED';
  dischargedAt: Date | null;
}

export abstract class SyncRepository {
  abstract findPatients(codes: string[]): Promise<PatientRef[]>;
  abstract therapistIds(ids: string[]): Promise<string[]>;
  // Did the tablet verify that therapist's PIN (THERAPIST_PIN_OK) in the 12 h before the start? (spec 002/106)
  abstract pinVerifiedBefore(deviceId: string, therapistId: string, startedAt: Date): Promise<boolean>;
  // Spec 112: the guardian's children and the patient of each homework item.
  abstract guardianPatientIds(guardianId: string): Promise<string[]>;
  abstract homeworkPatients(ids: string[]): Promise<{ id: string; patientId: string }[]>;
  // Sessions and runs that already exist on the server (from earlier batches), with their patient and their guardian.
  abstract existingSessions(ids: string[]): Promise<{ id: string; patientId: string; guardianId: string | null }[]>;
  abstract existingRuns(ids: string[]): Promise<{ id: string; sessionId: string }[]>;
  // Inserts what is new in one transaction; repeated items are ignored (idempotent). Closes sessions that arrive with an end.
  abstract save(
    batch: { sessions: SessionRow[]; events: SyncEvent[]; activityRuns: SyncActivityRun[]; activityResults: SyncActivityResult[] },
    source: BatchSource,
  ): Promise<void>;
  // "Most used" (spec 105 FR-008): recalculates the use of those pictograms from the events and bumps the profile version.
  abstract refreshUsage(patientIds: string[], pictogramIds: string[]): Promise<void>;
}

// Live delivery (spec 106 FR-005/006): events to whoever watches a patient and status changes to whoever watches presence.
export abstract class LiveFeed {
  abstract publish(patientId: string, message: Record<string, unknown>): void;
  // Something changed for these patients (new batch, tablet connected or not): their status is recalculated and delivered.
  abstract statusChanged(patientIds: string[]): Promise<void>;
  abstract tabletConnected(deviceId: string): boolean;
}

// Read for the live panel: visible patients with their open session and what has already happened in it.
export abstract class LiveRead {
  // Therapist: her assigned patients; admin (no therapistId): all active ones.
  abstract patients(viewer: { therapistId?: string }, page: PageRequest): Promise<Page<LivePatient>>;
  abstract byIds(patientIds: string[]): Promise<LivePatient[]>;
  abstract openOnDevice(deviceId: string): Promise<string[]>; // patients with an open session on that tablet
  abstract sessionLog(sessionId: string): Promise<{ events: unknown[]; results: unknown[] }>;
  abstract assignedTherapists(patientId: string): Promise<string[]>;
}
