import { WeakPassword, WeakPin } from '../exceptions/auth.exceptions';

// Platform roles (constitution §5); same values as the Prisma enum. PARENT: guardian (spec 112).
export enum Role {
  THERAPIST = 'THERAPIST',
  ADMIN = 'ADMIN',
  PARENT = 'PARENT',
  SUPER_ADMIN = 'SUPER_ADMIN', // platform-level, no institution (spec 113)
}

// Spec 101 FR-001: at least 10 characters, with letters and numbers.
export const passwordPattern = /^(?=.*\p{L})(?=.*\d).{10,}$/u;

export function assertPasswordPolicy(password: string): void {
  if (!passwordPattern.test(password)) throw new WeakPassword();
}

// Spec 002: tablet PIN of 4 to 6 digits, with no repeated or sequential digits (1111, 1234, 4321).
export const pinPattern = /^\d{4,6}$/;

export function assertPinPolicy(pin: string): void {
  const steps = [...pin].slice(1).map((digit, i) => Number(digit) - Number(pin[i]));
  const sequence = steps.every((step) => step === steps[0]) && Math.abs(steps[0]) <= 1;
  if (!pinPattern.test(pin) || sequence) throw new WeakPin();
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface UserProps {
  id: string;
  institutionId: string | null; // spec 113: set by the database on create (the connection's); null for the super admin
  name: string;
  email: string;
  passwordHash: string;
  mustChangePassword: boolean; // temporary password: must be changed before using the API
  pinHash: string | null; // tablet PIN (spec 002); null = none
  pinFailures: number; // consecutive PIN failures
  pinLockedUntil: Date | null;
  role: Role;
  specialty: string | null; // area of a specialist; filters the agenda and the metrics
  active: boolean;
  createdAt: Date;
}

// Data is read directly (user.email); only the class methods change it.
export interface User extends Readonly<UserProps> {}
export class User {
  private constructor(props: UserProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  static create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: Role;
    mustChangePassword?: boolean;
    specialty?: string | null;
  }) {
    return new User({
      ...input,
      id: crypto.randomUUID(),
      institutionId: null,
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      mustChangePassword: input.mustChangePassword ?? false,
      pinHash: null,
      pinFailures: 0,
      pinLockedUntil: null,
      specialty: input.specialty ?? null,
      active: true,
      createdAt: new Date(),
    });
  }

  // A deactivated user cannot sign in, even with the right password.
  canLogIn() {
    return this.active;
  }

  isActiveAdmin() {
    return this.active && this.role === Role.ADMIN;
  }

  // Chosen by the user themselves (change or recovery): clears the temporary password.
  changePassword(passwordHash: string) {
    this.set({ passwordHash, mustChangePassword: false });
  }

  // Assigned by the admin (spec 102): forces a change on sign-in.
  assignTemporaryPassword(passwordHash: string) {
    this.set({ passwordHash, mustChangePassword: true });
  }

  setSpecialty(specialty: string | null) {
    this.set({ specialty });
  }

  rename(name: string) {
    this.set({ name: name.trim() });
  }

  changeEmail(email: string) {
    this.set({ email: normalizeEmail(email) });
  }

  // Users are not deleted, only deactivated (spec 102 FR-001).
  setActive(active: boolean) {
    this.set({ active });
  }

  hasPin() {
    return this.pinHash !== null;
  }

  // Created or changed by the therapist herself (spec 002): starts with no failures.
  setPin(pinHash: string) {
    this.set({ pinHash, pinFailures: 0, pinLockedUntil: null });
  }

  // Deleted by the admin, or voided on its own after 10 failures: she must create another from her account.
  clearPin() {
    this.set({ pinHash: null, pinFailures: 0, pinLockedUntil: null });
  }

  isPinLocked(now: Date) {
    return this.pinLockedUntil !== null && this.pinLockedUntil > now;
  }

  pinAccepted() {
    this.set({ pinFailures: 0, pinLockedUntil: null });
  }

  // Every 5 consecutive failures lock for 60 s; the tenth voids the PIN.
  registerPinFailure(now: Date): 'failed' | 'locked' | 'revoked' {
    const pinFailures = this.pinFailures + 1;
    if (pinFailures >= 10) {
      this.clearPin();
      return 'revoked';
    }
    const locked = pinFailures % 5 === 0;
    this.set({ pinFailures, pinLockedUntil: locked ? new Date(now.getTime() + 60_000) : this.pinLockedUntil }); // 60 s
    return locked ? 'locked' : 'failed';
  }

  toSnapshot(): UserProps {
    return { ...this };
  }

  private set(changes: Partial<UserProps>) {
    Object.assign(this, changes);
  }
}
