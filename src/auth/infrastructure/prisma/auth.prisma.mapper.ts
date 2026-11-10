import type * as db from '@prisma/client';
import { LoginAttempt } from '../../domain/entities/login-attempt.entity';
import { PasswordReset } from '../../domain/entities/password-reset.entity';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { Role, User } from '../../domain/entities/user.entity';

// The only place that knows the Prisma shape for the auth module.
export class AuthPrismaMapper {
  static userToDomain(raw: db.User): User {
    return User.reconstitute({
      id: raw.id,
      institutionId: raw.institutionId,
      name: raw.name,
      email: raw.email,
      passwordHash: raw.passwordHash,
      mustChangePassword: raw.mustChangePassword,
      pinHash: raw.pinHash,
      pinFailures: raw.pinFailures,
      pinLockedUntil: raw.pinLockedUntil,
      role: raw.role as Role,
      specialty: raw.specialty,
      active: raw.active,
      createdAt: raw.createdAt,
    });
  }

  // No institutionId: it never changes and on create the database sets it (spec 113).
  static userToPrisma(user: User) {
    const { institutionId: _, ...data } = user.toSnapshot();
    return data;
  }

  static refreshTokenToDomain(raw: db.RefreshToken): RefreshToken {
    return RefreshToken.reconstitute({
      id: raw.id,
      userId: raw.userId,
      tokenHash: raw.tokenHash,
      expiresAt: raw.expiresAt,
      revokedAt: raw.revokedAt,
    });
  }

  static refreshTokenToPrisma(token: RefreshToken) {
    return token.toSnapshot();
  }

  static passwordResetToDomain(raw: db.PasswordReset): PasswordReset {
    return PasswordReset.reconstitute({
      id: raw.id,
      userId: raw.userId,
      tokenHash: raw.tokenHash,
      expiresAt: raw.expiresAt,
      usedAt: raw.usedAt,
    });
  }

  static passwordResetToPrisma(reset: PasswordReset) {
    return reset.toSnapshot();
  }

  static loginAttemptToDomain(raw: db.LoginAttempt): LoginAttempt {
    return LoginAttempt.reconstitute({
      email: raw.email,
      ip: raw.ip,
      failures: raw.failures,
      windowStartsAt: raw.windowStartsAt,
      lockedUntil: raw.lockedUntil,
    });
  }

  static loginAttemptToPrisma(attempt: LoginAttempt) {
    return attempt.toSnapshot();
  }
}
