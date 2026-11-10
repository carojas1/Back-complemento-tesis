import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { DeviceNotFound } from '../domain/exceptions/devices.exceptions';
import { DevicesRepository } from '../domain/ports/devices.repository';

// The token stops working on the next request; the tablet and its sessions are kept (FR-003).
@Injectable()
export class RevokeDeviceUseCase {
  constructor(
    private readonly devices: DevicesRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; adminId: string; ip?: string }) {
    const device = await this.devices.findDeviceById(input.id);
    if (!device) throw new DeviceNotFound();
    if (device.isRevoked()) return;

    device.revoke(new Date());
    await this.devices.saveDevice(device);
    await this.audit.record({
      action: 'DEVICE_REVOKED',
      actorType: 'USER',
      actorId: input.adminId,
      entity: 'Device',
      entityId: device.id,
      ip: input.ip,
      summary: { name: device.name },
    });
  }
}
