import { Injectable } from '@nestjs/common';
import { TokenService } from '../../auth/domain/ports/security.ports';
import { Device } from '../domain/entities/device.entity';
import { DeviceUnauthorized } from '../domain/exceptions/devices.exceptions';
import { DevicesRepository, SignatureVerifier } from '../domain/ports/devices.repository';

// Rule for accepting a tablet request (HTTP and, later, the spec 106 WebSocket):
// valid token + signature of `METHOD\npath\ntimestamp` with the Keystore key, within 5 minutes of drift.
// ponytail: within those 5 minutes a captured request could be replayed; TLS prevents it in practice.
// If needed, store the timestamps used per tablet (Redis) to reject replays.
@Injectable()
export class AuthenticateDeviceUseCase {
  constructor(
    private readonly devices: DevicesRepository,
    private readonly tokens: TokenService,
    private readonly signatures: SignatureVerifier,
  ) {}

  async execute(input: { token?: string; timestamp?: string; signature?: string; method: string; path: string }): Promise<Device> {
    const { token, timestamp, signature } = input;
    if (!token || !timestamp || !signature) throw new DeviceUnauthorized('missing headers');

    const device = await this.devices.findDeviceByTokenHash(this.tokens.hashOpaqueToken(token));
    if (!device) throw new DeviceUnauthorized('unknown token');
    if (device.isRevoked()) throw new DeviceUnauthorized('revoked');

    const now = new Date();
    if (Math.abs(now.getTime() - Number(timestamp)) > 5 * 60_000) throw new DeviceUnauthorized('date out of range');

    const message = `${input.method.toUpperCase()}\n${input.path}\n${timestamp}`;
    if (!this.signatures.verify(device.publicKey, message, signature)) throw new DeviceUnauthorized('invalid signature');

    if (device.touch(now)) await this.devices.saveLastSeen(device);
    return device;
  }
}
