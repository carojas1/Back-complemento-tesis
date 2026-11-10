import { Injectable } from '@nestjs/common';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { CenterPinHash } from '../../domain/entities/center-settings.entity';
import { CenterPinHasher } from '../../domain/ports/settings.repository';

const derive = (pin: string, salt: string, iterations: number) => pbkdf2Sync(pin, Buffer.from(salt, 'base64'), iterations, 32, 'sha256');

// The same computation as the tablet's `DeviceKey.pbkdf2`: PBKDF2-HMAC-SHA256, 16-byte salt, 32 bytes, base64.
@Injectable()
export class Pbkdf2CenterPinHasher extends CenterPinHasher {
  hash(pin: string) {
    const salt = randomBytes(16).toString('base64');
    const iterations = 100_000;
    return { salt, hash: derive(pin, salt, iterations).toString('base64'), iterations };
  }

  verify(pin: string, { salt, hash, iterations }: CenterPinHash) {
    return timingSafeEqual(derive(pin, salt, iterations), Buffer.from(hash, 'base64'));
  }
}
