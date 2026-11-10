import { Injectable } from '@nestjs/common';
import { assertPinPolicy } from '../domain/entities/user.entity';
import { SessionNotValid, WrongPassword } from '../domain/exceptions/auth.exceptions';
import { AuthAuditLog } from '../domain/ports/auth-notifications.ports';
import { AuthRepository } from '../domain/ports/auth.repository';
import { PasswordHasher } from '../domain/ports/security.ports';

// Spec 002: the therapist creates or changes her tablet PIN by confirming her password. The API stores only the hash.
@Injectable()
export class SetPinUseCase {
  constructor(
    private readonly repo: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { userId: string; currentPassword: string; pin: string; ip?: string }) {
    assertPinPolicy(input.pin);
    const user = await this.repo.findUserById(input.userId);
    if (!user?.canLogIn()) throw new SessionNotValid('inactive user');
    if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) throw new WrongPassword();

    const replaced = user.hasPin();
    user.setPin(await this.hasher.hash(input.pin));
    await this.repo.saveUser(user);
    await this.audit.record({
      action: 'PIN_SET',
      actorType: 'USER',
      actorId: user.id,
      userId: user.id,
      ip: input.ip,
      summary: { replaced },
    });
  }
}
