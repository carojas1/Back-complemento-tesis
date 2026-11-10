import { Injectable } from '@nestjs/common';
import { enterInstitution } from '../../tenancy/tenancy';
import { InvalidResetToken } from '../domain/exceptions/auth.exceptions';
import { assertPasswordPolicy } from '../domain/entities/user.entity';
import { AuthAuditLog } from '../domain/ports/auth-notifications.ports';
import { AuthRepository } from '../domain/ports/auth.repository';
import { PasswordHasher, TokenService } from '../domain/ports/security.ports';

// Completes "Forgot my password" with the token from the e-mail.
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { token: string; newPassword: string; ip?: string }): Promise<void> {
    assertPasswordPolicy(input.newPassword);
    const now = new Date();

    const reset = await this.repo.findPasswordResetByHash(this.tokens.hashOpaqueToken(input.token));
    if (!reset?.isUsable(now)) throw new InvalidResetToken();

    const user = await this.repo.findAccount(reset.userId);
    if (!user?.canLogIn()) throw new InvalidResetToken();
    enterInstitution(user.institutionId);

    user.changePassword(await this.hasher.hash(input.newPassword));
    reset.markUsed(now);
    if (!(await this.repo.completePasswordReset(reset, user))) throw new InvalidResetToken();

    await this.audit.record({ action: 'PASSWORD_RESET', actorType: 'USER', actorId: user.id, userId: user.id, ip: input.ip });
  }
}
