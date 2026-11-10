import { Injectable } from '@nestjs/common';
import { assertPasswordPolicy } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { AuthRepository } from '../../auth/domain/ports/auth.repository';
import { PasswordHasher } from '../../auth/domain/ports/security.ports';
import { UserNotFound } from '../domain/exceptions/users.exceptions';

// The admin gives another temporary password: sessions are closed and it must be changed on sign-in.
@Injectable()
export class AssignTemporaryPasswordUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; temporaryPassword: string; actorId: string; ip?: string }): Promise<void> {
    assertPasswordPolicy(input.temporaryPassword);
    const user = await this.auth.findUserById(input.id);
    if (!user) throw new UserNotFound();

    user.assignTemporaryPassword(await this.hasher.hash(input.temporaryPassword));
    await this.auth.savePasswordChange(user, new Date());
    await this.audit.record({ action: 'TEMP_PASSWORD_SET', actorType: 'USER', actorId: input.actorId, userId: user.id, ip: input.ip });
  }
}
