import { Injectable } from '@nestjs/common';
import { PasswordUnchanged, SessionNotValid, WrongPassword } from '../domain/exceptions/auth.exceptions';
import { assertPasswordPolicy } from '../domain/entities/user.entity';
import { AuthAuditLog } from '../domain/ports/auth-notifications.ports';
import { AuthRepository } from '../domain/ports/auth.repository';
import { PasswordHasher } from '../domain/ports/security.ports';
import { SessionTokens } from './session-tokens.service';

// Password change with a signed-in session (also the mandatory one after the
// temporary password). Closes all sessions and returns a new one for this device.
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessionTokens: SessionTokens,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { userId: string; currentPassword: string; newPassword: string; ip?: string }) {
    assertPasswordPolicy(input.newPassword);
    const user = await this.repo.findUserById(input.userId);
    if (!user?.canLogIn()) throw new SessionNotValid('inactive user');
    if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) throw new WrongPassword();
    if (input.newPassword === input.currentPassword) throw new PasswordUnchanged();

    const now = new Date();
    const wasTemporary = user.mustChangePassword;
    user.changePassword(await this.hasher.hash(input.newPassword));
    await this.repo.savePasswordChange(user, now);

    const refresh = this.sessionTokens.newRefreshToken(user.id, now);
    await this.repo.saveRefreshToken(refresh.entity);
    await this.audit.record({
      action: 'PASSWORD_CHANGED',
      actorType: 'USER',
      actorId: user.id,
      userId: user.id,
      ip: input.ip,
      summary: { wasTemporary },
    });
    return this.sessionTokens.toSession(user, refresh);
  }
}
