import { Injectable } from '@nestjs/common';
import { assertPinPolicy } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { WrongCenterPin } from '../domain/exceptions/settings.exceptions';
import { CenterPinHasher, SettingsRepository } from '../domain/ports/settings.repository';
import { toSettingsView } from './settings-view';

// Spec 002 FR-002/FR-006: the admin creates the Center PIN (one for all tablets) or changes it by typing
// the current one. The API stores only its hash; tablets download it when syncing. It is audited.
@Injectable()
export class SetCenterPinUseCase {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly pins: CenterPinHasher,
    private readonly audit: AuthAuditLog,
    private readonly storage: FileStorage,
  ) {}

  async execute(input: { currentPin?: string; pin: string; adminId: string; ip?: string }) {
    const settings = await this.settings.get();
    if (settings.centerPin && !(input.currentPin && this.pins.verify(input.currentPin, settings.centerPin))) throw new WrongCenterPin();
    assertPinPolicy(input.pin); // without sequences like 1111 or 1234
    const created = !settings.centerPin;
    settings.setPin(this.pins.hash(input.pin));
    const saved = await this.settings.save(settings);
    await this.audit.record({
      action: 'CENTER_PIN_SET',
      actorType: 'USER',
      actorId: input.adminId,
      entity: 'CenterSettings',
      ip: input.ip,
      summary: { created },
    });
    return toSettingsView(saved, this.storage);
  }
}
