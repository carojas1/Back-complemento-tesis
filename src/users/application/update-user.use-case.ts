import { Injectable } from '@nestjs/common';
import { normalizeEmail, Role } from '../../auth/domain/entities/user.entity';
import { EmailTaken } from '../../auth/domain/exceptions/auth.exceptions';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { AuthRepository } from '../../auth/domain/ports/auth.repository';
import { assertQuota } from '../../limits/domain/entities/quota.entity';
import { QuotaReader } from '../../limits/domain/ports/quota.reader';
import { FutureAppointmentsCanceller } from '../../appointments/domain/ports/appointments.repository';
import { LastActiveAdmin, UserNotFound } from '../domain/exceptions/users.exceptions';
import { UsersRepository } from '../domain/ports/users.repository';

// Name, e-mail and active. Deactivating is the spec 102 "delete" (FR-001).
// Changing the e-mail or deactivating closes the user's sessions.
@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuthAuditLog,
    private readonly quota: QuotaReader,
    private readonly appointments: FutureAppointmentsCanceller,
  ) {}

  async execute(input: {
    id: string;
    name?: string;
    email?: string;
    specialty?: string | null;
    active?: boolean;
    actorId: string;
    ip?: string;
  }) {
    const user = await this.auth.findUserById(input.id);
    if (!user) throw new UserNotFound();
    const changed: string[] = [];

    if (input.name !== undefined && input.name.trim() !== user.name) {
      user.rename(input.name);
      changed.push('name');
    }
    if (input.email !== undefined && normalizeEmail(input.email) !== user.email) {
      if (await this.auth.findUserByEmail(normalizeEmail(input.email))) throw new EmailTaken();
      user.changeEmail(input.email);
      changed.push('email');
    }
    if (input.specialty !== undefined && input.specialty !== user.specialty) {
      user.setSpecialty(input.specialty);
      changed.push('specialty');
    }
    if (input.active !== undefined && input.active !== user.active) {
      // ponytail: count and then save without a lock; two admins deactivating themselves at the same time
      // could leave zero. With 1-2 admins in the Center a lock is not justified.
      if (user.isActiveAdmin() && (await this.users.countActiveAdmins()) <= 1) throw new LastActiveAdmin();
      if (input.active && user.role === Role.THERAPIST) assertQuota(await this.quota.usage(), 'therapists');
      user.setActive(input.active);
      changed.push('active');
    }
    if (changed.length === 0) return user;

    await this.auth.saveUser(user);
    if (changed.includes('email') || !user.active) await this.auth.revokeAllRefreshTokens(user.id, new Date());
    if (changed.includes('active') && !user.active) await this.appointments.cancelForTherapist(user.id, new Date());
    await this.audit.record({
      action: 'USER_UPDATE',
      actorType: 'USER',
      actorId: input.actorId,
      userId: user.id,
      ip: input.ip,
      summary: { fields: changed, active: user.active },
    });
    return user;
  }
}
