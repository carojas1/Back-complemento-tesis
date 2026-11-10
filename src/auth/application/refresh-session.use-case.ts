import { Injectable } from '@nestjs/common';
import { enterInstitution } from '../../tenancy/tenancy';
import { InvalidRefreshToken, RefreshRaceLost } from '../domain/exceptions/auth.exceptions';
import { AuthRepository } from '../domain/ports/auth.repository';
import { TokenService } from '../domain/ports/security.ports';
import { IssuedSession, SessionTokens } from './session-tokens.service';

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: TokenService,
    private readonly sessionTokens: SessionTokens,
  ) {}

  async execute(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw new InvalidRefreshToken('no cookie');
    const now = new Date();

    const current = await this.repo.findRefreshTokenByHash(this.tokens.hashOpaqueToken(refreshToken));
    if (!current) throw new InvalidRefreshToken('unknown');

    // Reusing an already rotated token signals theft: all the user's sessions are closed. Inside the grace window
    // it is a race from the same browser (two tabs, a retry): that request fails and the new cookie keeps working.
    if (current.wasJustRotated(now)) throw new RefreshRaceLost('rotated a moment ago');
    if (current.isRevoked()) {
      await this.repo.revokeAllRefreshTokens(current.userId, now);
      throw new InvalidRefreshToken('reused');
    }
    if (!current.isUsable(now)) throw new InvalidRefreshToken('expired');

    const user = await this.repo.findAccount(current.userId);
    if (user) enterInstitution(user.institutionId);
    if (!user?.canLogIn()) {
      await this.repo.revokeAllRefreshTokens(current.userId, now);
      throw new InvalidRefreshToken('inactive user');
    }

    const next = this.sessionTokens.newRefreshToken(user.id, now);
    current.revoke(now);
    // Another request rotated this token at the same instant: it is a race and the one that won keeps the session.
    if (!(await this.repo.rotateRefreshToken(current, next.entity))) throw new RefreshRaceLost('rotated in parallel');
    return this.sessionTokens.toSession(user, next);
  }
}
