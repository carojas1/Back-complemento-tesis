import { Page, PageRequest } from '../../../common/pagination/page';

// What the guardian sees of their child (spec 112 FR-003): read-only.
export interface Child {
  id: string;
  code: string;
  firstNames: string;
  lastNames: string;
  avatarPath: string;
}

export interface ChildInfo extends Child {
  birthDate: Date;
  status: 'ACTIVE' | 'DISCHARGED';
  diagnosis: string | null;
  therapists: string[];
}

export interface SharedNote {
  id: string;
  text: string;
  createdAt: Date;
  authorName: string;
  sessionId: string | null;
}

export abstract class FamilyRead {
  abstract isLinked(patientId: string, guardianId: string): Promise<boolean>;
  abstract children(guardianId: string, page: PageRequest): Promise<Page<Child>>;
  abstract child(patientId: string): Promise<ChildInfo | null>;
  // Only the observations the therapist marked "Share with the family" (FR-004), newest to oldest.
  abstract sharedNotes(patientId: string, page: PageRequest): Promise<Page<SharedNote>>;
}
