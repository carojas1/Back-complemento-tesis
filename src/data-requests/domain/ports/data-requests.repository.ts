import { Page, PageRequest } from '../../../common/pagination/page';
import { DataRequest, DataRequestStatus, DataRequestType } from '../entities/data-request.entity';

export interface DataRequestFilter {
  status?: DataRequestStatus;
  type?: DataRequestType;
  therapistId?: string; // only those of their assigned patients
}

export interface DataRequestRow {
  request: DataRequest;
  patientId: string | null; // null if the patient was already deleted
  handledByName: string | null;
}

export abstract class DataRequestsRepository {
  abstract save(request: DataRequest): Promise<void>;
  abstract find(id: string): Promise<DataRequest | null>;
  abstract list(filter: DataRequestFilter, page: PageRequest): Promise<Page<DataRequestRow>>;
  abstract findOpen(patientCode: string, type: DataRequestType): Promise<DataRequest[]>;
}

export interface PatientRef {
  id: string;
  code: string;
  createdAt: Date;
}

// Everything the platform stores about the patient (right of access).
export interface PatientExport {
  patient: {
    code: string;
    firstNames: string;
    lastNames: string;
    birthDate: Date;
    guardianName: string;
    guardianPhone: string;
    consentDate: Date;
    status: string;
    dischargedAt: Date | null;
    createdAt: Date;
    avatar: string;
    diagnosis: string | null;
    conditions: string[];
    therapists: string[];
    profile: { gridSize: number; activityLevel: number; speechRate: number; sentenceBarEnabled: boolean; voice: string } | null;
    voice: { ownerName: string; relationship: string; consentDate: Date; status: string } | null;
  };
  notes: { createdAt: Date; editedAt: Date | null; authorName: string; sessionId: string | null; text: string }[];
  goals: { createdAt: Date; updatedAt: Date; authorName: string; text: string; status: string; targetDate: Date | null }[];
  sessions: {
    id: string;
    kind: string;
    startedAt: Date;
    endedAt: Date | null;
    deviceName: string | null;
    therapistName: string | null;
    guardianName: string | null;
  }[];
  homework: {
    createdAt: Date;
    authorName: string;
    instructions: string;
    dueDate: Date | null;
    pictograms: string[];
    withActivity: boolean;
    completedAt: Date | null;
  }[];
  events: { sessionId: string; occurredAt: Date; type: string; payload: unknown }[];
  results: {
    sessionId: string;
    activityType: string;
    answeredAt: Date;
    target: string;
    chosen: string;
    correct: boolean;
    firstAttempt: boolean;
    responseMs: number;
  }[];
}

// Patient read for the requests. Own port to avoid depending on the patients module.
export abstract class PatientRecords {
  abstract findById(id: string): Promise<PatientRef | null>;
  abstract findByCode(code: string): Promise<PatientRef | null>;
  abstract exportData(patientId: string): Promise<PatientExport>;
}

// Deletion (spec 110 T004) in a transaction; returns the bucket files that must be deleted afterwards.
export abstract class PatientEraser {
  abstract erase(input: {
    patientId: string;
    anonymize: boolean; // statisticalUseAllowed: the sessions move to the anonymous technical patient; otherwise they are deleted
    adminId: string;
    request: DataRequest; // saved as handled in the same transaction
  }): Promise<{ files: string[]; sessions: number }>;
}

// Builds the export ZIP (record as PDF, report, observations, goals, sessions, events and activities).
export abstract class ExportArchive {
  abstract build(input: { centerName: string; data: PatientExport; reportPdf: Buffer }): Promise<{ zip: Buffer; files: string[] }>;
}
