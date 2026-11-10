import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { TokenService } from '../../auth/domain/ports/security.ports';
import { assertQuota } from '../../limits/domain/entities/quota.entity';
import { QuotaReader } from '../../limits/domain/ports/quota.reader';
import { generateRegistrationCode, RegistrationCode } from '../domain/entities/registration-code.entity';
import { CenterPinNotSet, WrongCenterPin } from '../../settings/domain/exceptions/settings.exceptions';
import { CenterPinHasher, SettingsRepository } from '../../settings/domain/ports/settings.repository';
import { DevicesRepository } from '../domain/ports/devices.repository';

// The admin generates a code to register a tablet by typing the current Center PIN (spec 103 FR-007). The database
// stores only the code's hash (FR-001); it expires according to the Center settings.
@Injectable()
export class CreateRegistrationCodeUseCase {
  constructor(
    private readonly devices: DevicesRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuthAuditLog,
    private readonly settings: SettingsRepository,
    private readonly pins: CenterPinHasher,
    private readonly quota: QuotaReader,
  ) {}

  async execute(input: { adminId: string; centerPin: string; ip?: string }) {
    const settings = await this.settings.get();
    if (!settings.centerPin) throw new CenterPinNotSet();
    if (!this.pins.verify(input.centerPin, settings.centerPin)) throw new WrongCenterPin();
    assertQuota(await this.quota.usage(), 'devices'); // limit set by the super admin
    const plain = generateRegistrationCode();
    const code = RegistrationCode.issue(this.tokens.hashOpaqueToken(plain), input.adminId, new Date(), settings.registrationCodeMinutes);
    await this.devices.saveCode(code);

    await this.audit.record({
      action: 'DEVICE_CODE_CREATED',
      actorType: 'USER',
      actorId: input.adminId,
      ip: input.ip,
      summary: { expiresAt: code.expiresAt },
    });
    return { code: plain, expiresAt: code.expiresAt };
  }
}
