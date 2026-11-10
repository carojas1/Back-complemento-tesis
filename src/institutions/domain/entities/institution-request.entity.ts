// An institution's account request (spec 113 FR-005). Only the super admin reviews it.
// Flow: PENDING → IN_REVIEW (the super admin contacted the center, 24 h goal) → APPROVED or REJECTED.
export type RequestStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export const requestStatuses: RequestStatus[] = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'];
export const openStatuses: RequestStatus[] = ['PENDING', 'IN_REVIEW'];

// The platform promises to contact the center within 24 hours of the request.
export const contactWindowHours = 24;

export interface InstitutionRequest {
  id: string;
  institutionName: string;
  ruc: string;
  city: string;
  kind: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  approxPatients: number;
  message: string | null;
  privacyVersion: string;
  privacyAcceptedAt: Date;
  status: RequestStatus;
  contactedAt: Date | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  institutionId: string | null;
  createdAt: Date;
}

export interface Institution {
  id: string;
  name: string;
  ruc: string | null;
  city: string | null;
  kind: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  maxTherapists: number | null;
  maxDevices: number | null;
  active: boolean;
  suspendedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InstitutionChanges = Partial<
  Pick<Institution, 'name' | 'city' | 'kind' | 'email' | 'phone' | 'address' | 'maxTherapists' | 'maxDevices'>
>;

export const isOpen = (request: Pick<InstitutionRequest, 'status'>) => openStatuses.includes(request.status);

export const contactDueAt = (request: Pick<InstitutionRequest, 'createdAt'>) =>
  new Date(request.createdAt.getTime() + contactWindowHours * 60 * 60_000);

// Still PENDING after 24 hours: nobody has contacted the center yet.
export const isContactOverdue = (request: Pick<InstitutionRequest, 'status' | 'createdAt'>, now: Date) =>
  request.status === 'PENDING' && contactDueAt(request) < now;

// Version of the privacy notice the app shows (LOPDP art. 12): if the text changes, the version changes.
export const privacyNoticeVersion = '2026-10-28';

// First admin's temporary password: 12 characters without ambiguous ones (0/O, 1/l/I), with letters and numbers (spec 101).
export function generateTemporaryPassword() {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (from: string) => from[crypto.getRandomValues(new Uint32Array(1))[0] % from.length];
  return pick(letters) + pick(digits) + Array.from({ length: 10 }, () => pick(all)).join('');
}
