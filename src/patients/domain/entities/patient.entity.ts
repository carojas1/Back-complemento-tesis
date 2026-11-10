// Patient (spec 104). The admin creates it with the basics and the consent; the assigned therapist fills in the clinical part.
// Only the code and the avatar travel to the tablet (constitution §1.2).
export type PatientStatus = 'ACTIVE' | 'DISCHARGED';

export interface PatientProps {
  id: string;
  code: string; // P-0001, sequential and never reused
  avatarId: string;
  firstNames: string;
  lastNames: string;
  birthDate: Date;
  diagnosisId: string | null;
  conditionIds: string[];
  guardianName: string;
  guardianPhone: string;
  consentDate: Date;
  consentFilePath: string; // in the bucket, encrypted
  status: PatientStatus;
  dischargedAt: Date | null;
  createdBy: string;
}

export type PatientChanges = Partial<
  Pick<
    PatientProps,
    'avatarId' | 'firstNames' | 'lastNames' | 'birthDate' | 'diagnosisId' | 'conditionIds' | 'guardianName' | 'guardianPhone'
  >
>;

export interface Patient extends Readonly<PatientProps> {}
export class Patient {
  private constructor(props: PatientProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: PatientProps) {
    return new Patient(props);
  }

  static create(input: Omit<PatientProps, 'id' | 'diagnosisId' | 'conditionIds' | 'status' | 'dischargedAt'>) {
    return new Patient({
      ...input,
      id: crypto.randomUUID(),
      firstNames: input.firstNames.trim(),
      lastNames: input.lastNames.trim(),
      guardianName: input.guardianName.trim(),
      diagnosisId: null,
      conditionIds: [],
      status: 'ACTIVE',
      dischargedAt: null,
    });
  }

  // Returns the fields that really changed (dates and lists are compared by value).
  edit(changes: PatientChanges) {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const next: PatientChanges = {
      ...changes,
      firstNames: changes.firstNames?.trim(),
      lastNames: changes.lastNames?.trim(),
      guardianName: changes.guardianName?.trim(),
      conditionIds: changes.conditionIds && [...new Set(changes.conditionIds)].sort(),
    };
    const changed = (Object.keys(next) as (keyof PatientChanges)[]).filter((key) => next[key] !== undefined && !same(next[key], this[key]));
    Object.assign(this, Object.fromEntries(changed.map((key) => [key, next[key]])));
    return changed;
  }

  // Reversible therapeutic discharge: it stops being downloaded to tablets, the history is kept.
  discharge(now: Date) {
    if (this.status === 'ACTIVE') Object.assign(this, { status: 'DISCHARGED', dischargedAt: now });
  }

  reactivate() {
    if (this.status === 'DISCHARGED') Object.assign(this, { status: 'ACTIVE', dischargedAt: null });
  }

  toSnapshot(): PatientProps {
    return { ...this };
  }
}
