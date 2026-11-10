import { Role, User } from '../../../auth/domain/entities/user.entity';
import { Page, PageRequest } from '../../../common/pagination/page';

export interface UserFilter {
  role?: Role;
  active?: boolean;
}

// All the admin sees of a patient (spec 102 FR-002).
export interface AssignedPatient {
  id: string;
  code: string;
  avatarId: string;
}

// Therapist (TherapistPatient) or guardian (GuardianPatient, spec 112): the table comes from the role.
export type Assignee = Pick<User, 'id' | 'role'>;

// What users needs besides AuthRepository (find/save users and
// revoke sessions, which is reused from the auth module).
export abstract class UsersRepository {
  abstract list(filter: UserFilter, page: PageRequest): Promise<Page<User>>;
  abstract countActiveAdmins(): Promise<number>;
  abstract listAssignedPatients(user: Assignee, page: PageRequest): Promise<Page<AssignedPatient>>;
  // All of them, unpaginated: only to work out what changed when replacing the assignment.
  abstract findAssignedPatients(user: Assignee): Promise<AssignedPatient[]>;
  abstract findPatients(ids: string[]): Promise<AssignedPatient[]>;
  // Replaces the therapist's or guardian's whole patient list, in one transaction.
  abstract replaceAssignedPatients(user: Assignee, patientIds: string[]): Promise<void>;
}
