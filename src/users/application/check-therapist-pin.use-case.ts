import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { AuthAuditEntry, AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { AuthRepository } from '../../auth/domain/ports/auth.repository';
import { PasswordHasher } from '../../auth/domain/ports/security.ports';
import { PinLocked, PinNotSet, PinRevoked, TherapistNotFound, WrongPin } from '../domain/exceptions/users.exceptions';

// Spec 002: the tablet sends the typed PIN and the API compares it with the hash. On success, the session becomes "verified".
// ponytail: two simultaneous attempts may count as one (the whole user is saved); the per-IP throttle bounds it.
@Injectable()
export class CheckTherapistPinUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { therapistId: string; pin: string; deviceId: string; ip?: string }) {
    const user = await this.auth.findUserById(input.therapistId);
    if (!user?.canLogIn() || user.role !== Role.THERAPIST) throw new TherapistNotFound();
    if (!user.hasPin()) throw new PinNotSet();
    const now = new Date();
    if (user.isPinLocked(now)) throw new PinLocked();

    const entry: Omit<AuthAuditEntry, 'action'> = { actorType: 'DEVICE', actorId: input.deviceId, userId: user.id, ip: input.ip };
    if (await this.hasher.verify(user.pinHash, input.pin)) {
      user.pinAccepted();
      await this.auth.savePinState(user);
      await this.audit.record({ ...entry, action: 'THERAPIST_PIN_OK' });
      return { therapistId: user.id, name: user.name };
    }

    const result = user.registerPinFailure(now);
    await this.auth.savePinState(user);
    await this.audit.record({ ...entry, action: result === 'revoked' ? 'THERAPIST_PIN_REVOKED' : 'THERAPIST_PIN_FAILED' });
    throw { failed: new WrongPin(), locked: new PinLocked(), revoked: new PinRevoked() }[result];
  }
}
