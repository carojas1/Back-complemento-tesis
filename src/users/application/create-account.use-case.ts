import { Injectable } from '@nestjs/common';
import { assertPasswordPolicy, normalizeEmail, Role, User } from '../../auth/domain/entities/user.entity';
import { EmailTaken } from '../../auth/domain/exceptions/auth.exceptions';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { AuthRepository } from '../../auth/domain/ports/auth.repository';
import { PasswordHasher } from '../../auth/domain/ports/security.ports';
import { assertQuota } from '../../limits/domain/entities/quota.entity';
import { QuotaReader } from '../../limits/domain/ports/quota.reader';

// Only the admin creates accounts: for therapists and guardians (spec 112). Admins come from the seed or the console.
@Injectable()
export class CreateAccountUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuthAuditLog,
    private readonly quota: QuotaReader,
  ) {}

  async execute(input: {
    name: string;
    email: string;
    temporaryPassword: string;
    role?: Role.THERAPIST | Role.PARENT;
    specialty?: string;
    actorId: string;
    ip?: string;
  }) {
    assertPasswordPolicy(input.temporaryPassword);
    if (await this.auth.findUserByEmail(normalizeEmail(input.email))) throw new EmailTaken();
    // Limit set by the super admin (guardians do not count).
    if ((input.role ?? Role.THERAPIST) === Role.THERAPIST) assertQuota(await this.quota.usage(), 'therapists');

    const user = User.create({
      name: input.name,
      email: input.email,
      passwordHash: await this.hasher.hash(input.temporaryPassword),
      role: input.role ?? Role.THERAPIST,
      specialty: input.specialty,
      mustChangePassword: true,
    });
    await this.auth.saveUser(user);
    await this.audit.record({
      action: 'USER_CREATE',
      actorType: 'USER',
      actorId: input.actorId,
      userId: user.id,
      ip: input.ip,
      summary: { role: user.role, source: 'admin' },
    });
    return user;
  }
}
