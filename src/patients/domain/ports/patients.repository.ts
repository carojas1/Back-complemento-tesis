import { Page, PageRequest } from '../../../common/pagination/page';
import { Patient, PatientStatus } from '../entities/patient.entity';

export interface PatientFilter {
  search?: string; // name or code
  status?: PatientStatus;
  therapistId?: string; // only those assigned to this therapist
  excludeTherapistId?: string; // only those this therapist does not have yet (to assign her more)
}

// What is listed: no diagnosis or conditions (the admin does not see clinical data).
export interface PatientSummary {
  patient: Patient;
  avatarPath: string;
  therapists: { id: string; name: string }[];
}

// What the administration reads beyond the list: when the patient was registered and which tablets of the center they used.
export interface PatientAdministrativeFacts {
  registeredAt: Date;
  devices: { deviceId: string; name: string; sessions: number; minutes: number; lastSessionAt: Date | null }[];
}

export abstract class PatientsRepository {
  abstract nextCode(): Promise<string>;
  abstract save(patient: Patient, therapistIds?: string[]): Promise<void>;
  abstract find(id: string): Promise<PatientSummary | null>;
  abstract list(filter: PatientFilter, page: PageRequest): Promise<Page<PatientSummary>>;
  abstract isAssigned(patientId: string, therapistId: string): Promise<boolean>;
  abstract administrativeFacts(patientId: string): Promise<PatientAdministrativeFacts | null>;
  // Of those ids, the ones that are active therapists.
  abstract activeTherapistIds(ids: string[]): Promise<string[]>;
}

// Consent photo encrypted at rest (spec 104 FR-003): only the API decrypts it.
export abstract class ConsentVault {
  abstract store(image: Buffer, contentType: string): Promise<string>;
  abstract read(path: string): Promise<{ data: Buffer; contentType: string }>;
}
