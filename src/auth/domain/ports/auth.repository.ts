import { LoginAttempt } from '../entities/login-attempt.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';

export abstract class AuthRepository {
  // Within the request's institution (RLS does not let it see others).
  abstract findUserById(id: string): Promise<User | null>;
  abstract findUserByEmail(email: string): Promise<User | null>;
  // Across all institutions (spec 113): the owner of a token or of an e-mail + password. Excluding deactivated institutions.
  abstract findAccount(id: string): Promise<User | null>;
  abstract findAccountsByEmail(email: string): Promise<{ user: User; institution: { id: string; name: string } | null }[]>;
  abstract saveUser(user: User): Promise<void>;
  // Only the PIN and its attempts: a tablet's request in flight must not write back a password or a status read earlier.
  abstract savePinState(user: User): Promise<void>;

  abstract findLoginAttempt(email: string, ip: string): Promise<LoginAttempt | null>;
  abstract saveLoginAttempt(attempt: LoginAttempt): Promise<void>;
  abstract deleteLoginAttempt(email: string, ip: string): Promise<void>;

  abstract findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null>;
  abstract saveRefreshToken(token: RefreshToken): Promise<void>;
  // Revokes `current` and stores `next` atomically. Returns false if
  // `current` was already revoked (another request used it first).
  abstract rotateRefreshToken(current: RefreshToken, next: RefreshToken): Promise<boolean>;
  abstract revokeAllRefreshTokens(userId: string, now: Date): Promise<void>;
  // In a transaction: stores the password (and the temporary-password flag)
  // and revokes all the user's sessions.
  abstract savePasswordChange(user: User, now: Date): Promise<void>;

  abstract findPasswordResetByHash(tokenHash: string): Promise<PasswordReset | null>;
  abstract savePasswordReset(reset: PasswordReset): Promise<void>;
  // In a transaction: marks the link as used (only if it was not already),
  // stores the new password and revokes all the user's sessions.
  // Returns false if the link had already been used.
  abstract completePasswordReset(reset: PasswordReset, user: User): Promise<boolean>;
}
