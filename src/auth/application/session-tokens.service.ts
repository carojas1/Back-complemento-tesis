import { Injectable } from '@nestjs/common';
import { RefreshToken } from '../domain/entities/refresh-token.entity';
import { User } from '../domain/entities/user.entity';
import { TokenService } from '../domain/ports/security.ports';

export interface IssuedSession {
  accessToken: string;
  // Plain token: only travels in the cookie, the database stores its hash.
  refreshToken: string;
  refreshExpiresAt: Date;
  user: User;
}

// Builds the access + refresh pair. Shared by login and refresh.
@Injectable()
export class SessionTokens {
  constructor(private readonly tokens: TokenService) {}

  newRefreshToken(userId: string, now: Date) {
    const plain = this.tokens.generateOpaqueToken();
    const entity = RefreshToken.issue(userId, this.tokens.hashOpaqueToken(plain), now);
    return { plain, entity };
  }

  toSession(user: User, refresh: { plain: string; entity: RefreshToken }): IssuedSession {
    return {
      accessToken: this.tokens.signAccessToken({ sub: user.id, role: user.role }),
      refreshToken: refresh.plain,
      refreshExpiresAt: refresh.entity.expiresAt,
      user,
    };
  }
}
