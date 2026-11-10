import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmailTaken } from '../../domain/exceptions/auth.exceptions';
import { PrismaService } from '../../../prisma/prisma.service';
import { asSystem } from '../../../tenancy/tenancy';
import { LoginAttempt } from '../../domain/entities/login-attempt.entity';
import { PasswordReset } from '../../domain/entities/password-reset.entity';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import { User } from '../../domain/entities/user.entity';
import { AuthRepository } from '../../domain/ports/auth.repository';
import { AuthPrismaMapper as M } from './auth.prisma.mapper';

// The super admin has no institution; the other accounts only if their institution is still active.
const activeInstitution = { OR: [{ institutionId: null }, { institution: { active: true } }] };
// Account that validates each JWT, cached for 60 s (spec 114 FR-002); every write to the user clears it.
export const accountKey = (id: string) => `account:${id}`;

@Injectable()
export class AuthPrismaRepository extends AuthRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super();
  }

  async findUserById(id: string) {
    const raw = await this.prisma.user.findUnique({ where: { id } });
    return raw ? M.userToDomain(raw) : null;
  }

  async findUserByEmail(email: string) {
    const raw = await this.prisma.user.findFirst({ where: { email } });
    return raw ? M.userToDomain(raw) : null;
  }

  // An institution deactivated in the database stops getting in once the cache expires (up to 60 s).
  async findAccount(id: string) {
    const find = () => asSystem(() => this.prisma.user.findFirst({ where: { id, ...activeInstitution } }));
    const raw = await this.cache.wrap(accountKey(id), find);
    if (!raw) return null;
    const { createdAt, pinLockedUntil } = raw; // in Redis the row goes through JSON: dates come back as text
    return M.userToDomain({ ...raw, createdAt: new Date(createdAt), pinLockedUntil: pinLockedUntil && new Date(pinLockedUntil) });
  }

  async findAccountsByEmail(email: string) {
    const rows = await asSystem(() =>
      this.prisma.user.findMany({
        where: { email, ...activeInstitution },
        include: { institution: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map((raw) => ({ user: M.userToDomain(raw), institution: raw.institution }));
  }

  async saveUser(user: User) {
    const data = M.userToPrisma(user);
    try {
      await this.prisma.user.upsert({ where: { id: data.id }, create: data, update: data });
    } catch (error) {
      // Two simultaneous sign-ups with the same e-mail: the database decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new EmailTaken();
      throw error;
    }
    await this.cache.del(accountKey(user.id));
  }

  async savePinState({ id, pinHash, pinFailures, pinLockedUntil }: User) {
    await this.prisma.user.update({ where: { id }, data: { pinHash, pinFailures, pinLockedUntil } });
  }

  async findLoginAttempt(email: string, ip: string) {
    const raw = await this.prisma.loginAttempt.findUnique({ where: { email_ip: { email, ip } } });
    return raw ? M.loginAttemptToDomain(raw) : null;
  }

  async saveLoginAttempt(attempt: LoginAttempt) {
    const data = M.loginAttemptToPrisma(attempt);
    await this.prisma.loginAttempt.upsert({ where: { email_ip: { email: data.email, ip: data.ip } }, create: data, update: data });
  }

  async deleteLoginAttempt(email: string, ip: string) {
    await this.prisma.loginAttempt.deleteMany({ where: { email, ip } });
  }

  async findRefreshTokenByHash(tokenHash: string) {
    const raw = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return raw ? M.refreshTokenToDomain(raw) : null;
  }

  async saveRefreshToken(token: RefreshToken) {
    const data = M.refreshTokenToPrisma(token);
    await this.prisma.refreshToken.upsert({ where: { id: data.id }, create: data, update: data });
  }

  rotateRefreshToken(current: RefreshToken, next: RefreshToken) {
    const revokedAt = current.revokedAt;
    return this.prisma.$transaction(async (tx) => {
      // Condition in the UPDATE: only one concurrent request wins.
      const { count } = await tx.refreshToken.updateMany({ where: { id: current.id, revokedAt: null }, data: { revokedAt } });
      if (count === 0) return false;
      await tx.refreshToken.create({ data: M.refreshTokenToPrisma(next) });
      return true;
    });
  }

  async revokeAllRefreshTokens(userId: string, now: Date) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  }

  async savePasswordChange(user: User, now: Date) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: user.passwordHash, mustChangePassword: user.mustChangePassword },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    await this.cache.del(accountKey(user.id));
  }

  async findPasswordResetByHash(tokenHash: string) {
    const raw = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    return raw ? M.passwordResetToDomain(raw) : null;
  }

  async savePasswordReset(reset: PasswordReset) {
    const data = M.passwordResetToPrisma(reset);
    await this.prisma.passwordReset.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async completePasswordReset(reset: PasswordReset, user: User) {
    const done = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: reset.usedAt } });
      if (count === 0) return false;
      // A new password also ends any older link sent to this person.
      await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: reset.usedAt } });
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: user.passwordHash, mustChangePassword: user.mustChangePassword },
      });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: reset.usedAt } });
      return true;
    });
    await this.cache.del(accountKey(user.id));
    return done;
  }
}
