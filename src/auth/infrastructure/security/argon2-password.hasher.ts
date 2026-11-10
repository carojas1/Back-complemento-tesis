import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasher } from '../../domain/ports/security.ports';

// Spec 101 FR-001: argon2id.
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  private readonly dummyHash = argon2.hash('dummy-password-for-timing', { type: argon2.argon2id });

  hash(plain: string) {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string | null, plain: string) {
    const target = hash ?? (await this.dummyHash);
    const ok = await argon2.verify(target, plain).catch(() => false);
    return hash !== null && ok;
  }
}
