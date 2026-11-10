export interface RegistrationCodeProps {
  id: string;
  institutionId: string | null; // set by the database on save: that of the admin who generated it (spec 113)
  codeHash: string;
  createdBy: string; // admin who generated it
  expiresAt: Date;
  usedAt: Date | null;
}

// Spec 001 FR-001: 8 uppercase characters, without 0, O, 1 or I. 32 letters: no bias when using % on a byte.
export function generateRegistrationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => alphabet[byte % alphabet.length]).join('');
}

export const normalizeRegistrationCode = (code: string) => code.trim().toUpperCase();

// Spec 103: single-use and valid for the minutes set by the Center settings (15 by default).
export interface RegistrationCode extends Readonly<RegistrationCodeProps> {}
export class RegistrationCode {
  private constructor(props: RegistrationCodeProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: RegistrationCodeProps) {
    return new RegistrationCode(props);
  }

  static issue(codeHash: string, createdBy: string, now: Date, minutes: number) {
    const expiresAt = new Date(now.getTime() + minutes * 60_000);
    return new RegistrationCode({ id: crypto.randomUUID(), institutionId: null, codeHash, createdBy, expiresAt, usedAt: null });
  }

  isUsable(now: Date) {
    return this.usedAt === null && this.expiresAt > now;
  }

  markUsed(now: Date) {
    Object.assign(this, { usedAt: now });
  }

  toSnapshot(): RegistrationCodeProps {
    return { ...this };
  }
}
