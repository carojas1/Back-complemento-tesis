import { Role } from '../entities/user.entity';

export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  // With a null `hash` it still compares against a dummy hash, so a nonexistent e-mail
  // takes as long as a real one.
  abstract verify(hash: string | null, plain: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  // Seconds since the epoch, when the token was read from a request.
  exp?: number;
}

export abstract class TokenService {
  // 15-minute access JWT.
  abstract signAccessToken(claims: AccessTokenClaims): string;
  // Claims of a valid access JWT, or null (used by the WebSocket, which does not go through the HTTP guards).
  abstract verifyAccessToken(token: string): AccessTokenClaims | null;
  // Random opaque token (refresh and password links).
  abstract generateOpaqueToken(): string;
  // Hash under which an opaque token is stored: the database never holds the token.
  abstract hashOpaqueToken(token: string): string;
}
