import { Page, PageRequest } from '../../../common/pagination/page';

// Spec 109: filters of the admin's query (all optional).
export interface AuditFilters {
  actorId?: string;
  action?: string;
  patientCode?: string;
  from?: Date;
  to?: Date;
}

export interface AuditRecord {
  id: string;
  createdAt: Date;
  actorType: string;
  actorId: string | null;
  actorName: string | null; // name of the user or the tablet
  action: string;
  entity: string;
  entityId: string | null;
  patientCode: string | null; // never the patient's name (FR-001)
  ip: string | null;
  summary: unknown;
}

// Read-only: writing is the AuthAuditLog port and the database rejects UPDATE and DELETE (FR-003).
export abstract class AuditRepository {
  abstract list(filters: AuditFilters, page: PageRequest): Promise<Page<AuditRecord>>;
  abstract all(filters: AuditFilters, max: number): Promise<AuditRecord[]>;
  abstract find(id: bigint): Promise<AuditRecord | null>;
}

export interface AuditFileRequest {
  records: AuditRecord[];
  total: number;
  centerName: string;
  generatedAt: Date;
}

// The exported files: how they look is not a matter for the use case.
export abstract class AuditFileRenderer {
  abstract xlsx(records: AuditRecord[]): Promise<Buffer>;
  abstract pdf(request: AuditFileRequest): Promise<Buffer>;
}
