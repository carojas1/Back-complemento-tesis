import { Injectable } from '@nestjs/common';
import { enterInstitution } from '../../tenancy/tenancy';
import { AuthAuditLog } from '../domain/ports/auth-notifications.ports';
import { AuthRepository } from '../domain/ports/auth.repository';
import { TokenService } from '../domain/ports/security.ports';

// Revokes the refresh token. Responds the same even if there is no session.
@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(refreshToken: string | undefined, ip?: string): Promise<void> {
    if (!refreshToken) return;
    const now = new Date();
    const token = await this.repo.findRefreshTokenByHash(this.tokens.hashOpaqueToken(refreshToken));
    if (!token?.isUsable(now)) return;

    token.revoke(now);
    await this.repo.saveRefreshToken(token);
    enterInstitution((await this.repo.findAccount(token.userId))?.institutionId ?? null);
    await this.audit.record({ action: 'LOGOUT', actorType: 'USER', actorId: token.userId, userId: token.userId, ip });
  }
}
