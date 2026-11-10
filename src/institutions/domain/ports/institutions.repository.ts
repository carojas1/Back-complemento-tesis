import { User } from '../../../auth/domain/entities/user.entity';
import { Page, PageRequest } from '../../../common/pagination/page';
import { Institution, InstitutionChanges, InstitutionRequest, RequestStatus } from '../entities/institution-request.entity';

export type NewRequest = Omit<
  InstitutionRequest,
  'id' | 'status' | 'contactedAt' | 'reviewNotes' | 'reviewedBy' | 'reviewedAt' | 'rejectionReason' | 'institutionId' | 'createdAt'
> & { ip: string | null };

export type TemplateAvatar = { name: string; imagePath: string; active: boolean };

export interface InstitutionFilter {
  search?: string;
  active?: boolean;
}

export interface InstitutionAdmin {
  id: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}

// Counts only: the super admin never sees a center's patients or clinical data.
export interface InstitutionUsage {
  therapists: number;
  parents: number;
  activePatients: number;
  activeDevices: number;
  sessionsLast30Days: number;
}

// A center's activity according to what its tablets sync (therapy sessions only). Counts, never clinical data.
export interface CenterActivity {
  id: string;
  name: string;
  city: string | null;
  active: boolean;
  therapists: number;
  activePatients: number;
  sessionsLast30Days: number;
  lastSessionAt: Date | null;
}

export interface PlatformStats {
  requests: { pending: number; inReview: number; contactOverdue: number };
  institutions: { total: number; active: number; suspended: number };
  totals: { therapists: number; activePatients: number; activeDevices: number };
  plans: { active: number; pendingPayment: number; overdue: number; canceled: number; collectedCentsLastYear: number };
  oldestOpenRequests: InstitutionRequest[];
  // All institutions, those with the most sessions in the last 30 days first.
  centers: CenterActivity[];
}

// Platform tables: everything runs as the database owner (no RLS), and never touches a center's data except when creating it.
export abstract class InstitutionsRepository {
  abstract createRequest(request: NewRequest): Promise<InstitutionRequest>;
  abstract pendingWithRuc(ruc: string): Promise<boolean>;
  abstract institutionWithRuc(ruc: string): Promise<boolean>;
  abstract listRequests(status: RequestStatus | undefined, page: PageRequest): Promise<Page<InstitutionRequest>>;
  abstract findRequest(id: string): Promise<InstitutionRequest | null>;
  // PENDING → IN_REVIEW with the first-contact notes. False if it was no longer pending.
  abstract startReview(id: string, reviewerId: string, notes: string, now: Date): Promise<boolean>;
  // Adds notes to an open request (PENDING or IN_REVIEW). False if it was already reviewed.
  abstract saveReviewNotes(id: string, notes: string): Promise<boolean>;
  // In one transaction (FR-007): marks the request approved (only if it was still open), creates the institution, its
  // configuration, the copy of the template catalogs and the first admin. Null if it was no longer open.
  abstract approve(
    request: InstitutionRequest,
    admin: User,
    avatars: TemplateAvatar[],
    reviewerId: string,
    now: Date,
  ): Promise<Institution | null>;
  // Avatars of the template institution: their images are copied into the bucket before approving.
  abstract templateAvatars(): Promise<TemplateAvatar[]>;
  abstract reject(id: string, reviewerId: string, reason: string, now: Date): Promise<boolean>;
  abstract listInstitutions(filter: InstitutionFilter, page: PageRequest): Promise<Page<Institution>>;
  // Privacy notice: a rejected request is kept for six months.
  abstract purgeRejected(reviewedBefore: Date): Promise<void>;
  abstract superAdminEmails(): Promise<string[]>;

  abstract findInstitution(id: string): Promise<Institution | null>;
  abstract institutionUsage(id: string, since: Date): Promise<InstitutionUsage>;
  abstract listAdmins(institutionId: string): Promise<InstitutionAdmin[]>;
  abstract updateInstitution(id: string, changes: InstitutionChanges): Promise<Institution>;
  // Suspending also clears the center's session and tablet cache: it takes effect from the next request.
  abstract setActive(id: string, active: boolean, reason: string | null): Promise<Institution>;
  // Another admin of an existing center; throws EmailTaken if the e-mail already exists in that center.
  abstract createAdmin(institutionId: string, admin: User): Promise<void>;
  abstract platformStats(contactOverdueBefore: Date, monthAgo: Date): Promise<PlatformStats>;
}
