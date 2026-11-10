import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { JwtPayload } from '../http/jwt-payload.interface';
import { AccessTokenClaims, TokenService } from '../../domain/ports/security.ports';

@Injectable()
export class JwtTokenService extends TokenService {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  signAccessToken(claims: AccessTokenClaims) {
    const payload: JwtPayload = { sub: claims.sub, role: claims.role, typ: 'access' };
    return this.jwt.sign(payload);
  }

  verifyAccessToken(token: string) {
    try {
      const payload = this.jwt.verify<JwtPayload>(token, { algorithms: ['HS256'] });
      return payload.typ === 'access' ? { sub: payload.sub, role: payload.role, exp: payload.exp } : null;
    } catch {
      return null;
    }
  }

  generateOpaqueToken() {
    return randomBytes(32).toString('base64url');
  }

  hashOpaqueToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
