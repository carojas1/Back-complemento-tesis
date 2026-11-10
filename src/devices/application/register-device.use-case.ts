import { Injectable } from '@nestjs/common';
import { enterInstitution } from '../../tenancy/tenancy';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { TokenService } from '../../auth/domain/ports/security.ports';
import { assertQuota } from '../../limits/domain/entities/quota.entity';
import { QuotaReader } from '../../limits/domain/ports/quota.reader';
import { Device } from '../domain/entities/device.entity';
import { normalizeRegistrationCode } from '../domain/entities/registration-code.entity';
import { InvalidPublicKey, InvalidRegistrationCode } from '../domain/exceptions/devices.exceptions';
import { DevicesRepository, SignatureVerifier } from '../domain/ports/devices.repository';

// The tablet exchanges the code for an opaque token (spec 001). The token is handed over only once.
@Injectable()
export class RegisterDeviceUseCase {
  constructor(
    private readonly devices: DevicesRepository,
    private readonly tokens: TokenService,
    private readonly signatures: SignatureVerifier,
    private readonly audit: AuthAuditLog,
    private readonly quota: QuotaReader,
  ) {}

  async execute(input: { code: string; name: string; model?: string; appVersion?: string; publicKey: string; ip?: string }) {
    if (!this.signatures.isValidPublicKey(input.publicKey)) throw new InvalidPublicKey();

    const now = new Date();
    const code = await this.devices.findCodeByHash(this.tokens.hashOpaqueToken(normalizeRegistrationCode(input.code)));
    if (!code?.isUsable(now)) throw new InvalidRegistrationCode(code ? 'expired or used' : 'nonexistent');

    enterInstitution(code.institutionId); // the tablet and the audit stay in the code's institution
    assertQuota(await this.quota.usage(), 'devices'); // several codes may be issued under the limit and redeemed over it
    const token = this.tokens.generateOpaqueToken();
    const device = Device.register({
      institutionId: code.institutionId!,
      name: input.name,
      model: input.model ?? null,
      appVersion: input.appVersion ?? null,
      tokenHash: this.tokens.hashOpaqueToken(token),
      publicKey: input.publicKey,
      registrationCodeId: code.id,
    });
    code.markUsed(now);
    if (!(await this.devices.registerDevice(code, device))) throw new InvalidRegistrationCode('used in parallel');

    await this.audit.record({
      action: 'DEVICE_REGISTERED',
      actorType: 'DEVICE',
      actorId: device.id,
      entity: 'Device',
      entityId: device.id,
      ip: input.ip,
      summary: { name: device.name, model: device.model, authorizedBy: code.createdBy },
    });
    return { deviceId: device.id, token }; // the Center settings (and its PIN) are fetched with GET /devices/settings
  }
}
