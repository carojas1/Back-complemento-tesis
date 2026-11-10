import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { AuthRepository } from '../../auth/domain/ports/auth.repository';
import { UserNotFound } from '../domain/exceptions/users.exceptions';

// Spec 102/002: the admin clears the PIN of whoever forgot it; she creates another from her account.
@Injectable()
export class ClearPinUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; actorId: string; ip?: string }) {
    const user = await this.auth.findUserById(input.id);
    if (!user) throw new UserNotFound();
    if (!user.hasPin()) return;

    user.clearPin();
    await this.auth.saveUser(user);
    await this.audit.record({ action: 'PIN_CLEARED', actorType: 'USER', actorId: input.actorId, userId: user.id, ip: input.ip });
  }
}
