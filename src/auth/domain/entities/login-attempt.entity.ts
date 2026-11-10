export interface LoginAttemptProps {
  email: string;
  ip: string;
  failures: number;
  windowStartsAt: Date;
  lockedUntil: Date | null;
}

// Spec 101: 5 failures in 15 minutes lock that e-mail for 15 minutes, from that address only, so nobody can lock another person out from afar.
// It counts whether the user exists or not: the lock does not reveal which e-mails exist.
export interface LoginAttempt extends Readonly<LoginAttemptProps> {}
export class LoginAttempt {
  private constructor(props: LoginAttemptProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: LoginAttemptProps) {
    return new LoginAttempt(props);
  }

  static start(email: string, ip: string, now: Date) {
    return new LoginAttempt({ email, ip, failures: 0, windowStartsAt: now, lockedUntil: null });
  }

  isLocked(now: Date) {
    return this.lockedUntil !== null && this.lockedUntil > now;
  }

  registerFailure(now: Date) {
    const fifteenMinutes = 15 * 60_000;
    const windowExpired = now.getTime() - this.windowStartsAt.getTime() > fifteenMinutes;
    const failures = windowExpired ? 1 : this.failures + 1;

    if (failures >= 5) {
      // Locked; when the lock ends a new window starts.
      const lockedUntil = new Date(now.getTime() + fifteenMinutes);
      Object.assign(this, { failures: 0, windowStartsAt: lockedUntil, lockedUntil });
    } else {
      Object.assign(this, { failures, windowStartsAt: windowExpired ? now : this.windowStartsAt });
    }
  }

  toSnapshot(): LoginAttemptProps {
    return { ...this };
  }
}
