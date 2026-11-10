export interface PasswordResetProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

// "Forgot my password" link (spec 101): valid for 30 minutes and single-use.
export interface PasswordReset extends Readonly<PasswordResetProps> {}
export class PasswordReset {
  private constructor(props: PasswordResetProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: PasswordResetProps) {
    return new PasswordReset(props);
  }

  static issue(userId: string, tokenHash: string, now: Date) {
    const expiresAt = new Date(now.getTime() + 30 * 60_000); // 30 minutes
    return new PasswordReset({ id: crypto.randomUUID(), userId, tokenHash, expiresAt, usedAt: null });
  }

  isUsable(now: Date) {
    return this.usedAt === null && this.expiresAt > now;
  }

  markUsed(now: Date) {
    Object.assign(this, { usedAt: now });
  }

  toSnapshot(): PasswordResetProps {
    return { ...this };
  }
}
