import type * as db from '@prisma/client';
import { Device } from '../../domain/entities/device.entity';
import { RegistrationCode } from '../../domain/entities/registration-code.entity';

// The only place that knows the Prisma shape for the devices module.
export class DevicesPrismaMapper {
  static deviceToDomain(raw: db.Device) {
    const { id, institutionId, name, model, appVersion, tokenHash, publicKey, registrationCodeId } = raw;
    const { registeredAt, lastSeenAt, lastSyncAt, revokedAt } = raw;
    return Device.reconstitute({
      id,
      institutionId,
      name,
      model,
      appVersion,
      tokenHash,
      publicKey,
      registrationCodeId,
      registeredAt,
      lastSeenAt,
      lastSyncAt,
      revokedAt,
    });
  }

  static deviceToPrisma(device: Device) {
    return device.toSnapshot();
  }

  static codeToDomain(raw: db.DeviceRegistrationCode) {
    const { id, institutionId, codeHash, createdBy, expiresAt, usedAt } = raw;
    return RegistrationCode.reconstitute({ id, institutionId, codeHash, createdBy, expiresAt, usedAt });
  }

  static codeToPrisma(code: RegistrationCode) {
    const { institutionId: _, ...data } = code.toSnapshot();
    return data;
  }
}
