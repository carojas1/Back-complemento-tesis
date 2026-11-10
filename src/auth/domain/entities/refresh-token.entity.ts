export interface RefreshTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

// Window after a rotation in which reusing the previous token is not theft (the OAuth rotation "reuse interval").
export const reuseGraceMs = 30_000;

// Spec 101 FR-002: lasts 7 days, rotates on every use and is revocable.
export interface RefreshToken extends Readonly<RefreshTokenProps> {}
export class RefreshToken {
  private constructor(props: RefreshTokenProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: RefreshTokenProps) {
    return new RefreshToken(props);
  }

  static issue(userId: string, tokenHash: string, now: Date) {
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60_000); // 7 days
    return new RefreshToken({ id: crypto.randomUUID(), userId, tokenHash, expiresAt, revokedAt: null });
  }

  isRevoked() {
    return this.revokedAt !== null;
  }

  isUsable(now: Date) {
    return !this.isRevoked() && this.expiresAt > now;
  }

  // Rotated a moment ago: a second use is a race from the same client (two tabs, a retry), not theft.
  wasJustRotated(now: Date) {
    return this.revokedAt !== null && now.getTime() - this.revokedAt.getTime() < reuseGraceMs;
  }

  revoke(now: Date) {
    if (!this.isRevoked()) Object.assign(this, { revokedAt: now });
  }

  toSnapshot(): RefreshTokenProps {
    return { ...this };
  }
}
