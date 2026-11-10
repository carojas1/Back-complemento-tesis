import { Injectable } from '@nestjs/common';
import { enterInstitution } from '../../tenancy/tenancy';
import { LoginAttempt } from '../domain/entities/login-attempt.entity';
import { normalizeEmail } from '../domain/entities/user.entity';
import { AccountLocked, ChooseInstitution, InvalidCredentials } from '../domain/exceptions/auth.exceptions';
import { AuthAuditLog } from '../domain/ports/auth-notifications.ports';
import { AuthRepository } from '../domain/ports/auth.repository';
import { PasswordHasher } from '../domain/ports/security.ports';
import { IssuedSession, SessionTokens } from './session-tokens.service';

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessionTokens: SessionTokens,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { email: string; password: string; institutionId?: string; ip?: string }): Promise<IssuedSession> {
    const email = normalizeEmail(input.email);
    const now = new Date();

    // ponytail: read-modify-write without a lock; two simultaneous failures may count as one.
    // The /auth/login ThrottlerGuard bounds the burst per IP.
    const ip = input.ip ?? '';
    const attempt = (await this.repo.findLoginAttempt(email, ip)) ?? LoginAttempt.start(email, ip, now);
    if (attempt.isLocked(now)) {
      await this.audit.record({ action: 'LOGIN_FAILED', actorType: 'USER', ip: input.ip, summary: { email, reason: 'LOCKED' } });
      throw new AccountLocked();
    }

    // Spec 113 FR-008: the same e-mail may have accounts in several institutions; the one that accepts the password wins.
    const accounts = await this.repo.findAccountsByEmail(email);
    const checks = accounts.length ? accounts : [null]; // with no accounts a hash is still verified: same response time
    const valid: typeof accounts = [];
    for (const account of checks)
      if ((await this.hasher.verify(account?.user.passwordHash ?? null, input.password)) && account) valid.push(account);
    const usable = valid.filter((a) => a.user.canLogIn() && (!input.institutionId || a.user.institutionId === input.institutionId));
    if (usable.length > 1) throw new ChooseInstitution(usable.map((a) => a.institution!));
    const user = usable[0]?.user;

    if (!user) {
      const known = (valid[0] ?? accounts[0])?.user;
      const reason = !known ? 'UNKNOWN_EMAIL' : !valid.length ? 'BAD_PASSWORD' : input.institutionId ? 'OTHER_INSTITUTION' : 'INACTIVE';
      attempt.registerFailure(now);
      await this.repo.saveLoginAttempt(attempt);
      if (known) enterInstitution(known.institutionId); // the admin of that institution sees it
      await this.audit.record({
        action: 'LOGIN_FAILED',
        actorType: 'USER',
        actorId: known?.id,
        userId: known?.id,
        ip: input.ip,
        summary: { email, reason },
      });
      throw new InvalidCredentials(reason);
    }

    enterInstitution(user.institutionId);
    await this.repo.deleteLoginAttempt(email, ip);
    const refresh = this.sessionTokens.newRefreshToken(user.id, now);
    await this.repo.saveRefreshToken(refresh.entity);
    await this.audit.record({ action: 'LOGIN_SUCCESS', actorType: 'USER', actorId: user.id, userId: user.id, ip: input.ip });
    return this.sessionTokens.toSession(user, refresh);
  }
}
