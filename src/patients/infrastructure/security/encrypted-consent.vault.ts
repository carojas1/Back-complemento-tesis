import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { FileStorage } from '../../../common/storage/file-storage';
import { detectImageType } from '../../../pictograms/domain/entities/pictogram.entity';
import { ConsentVault } from '../../domain/ports/patients.repository';

// Spec 104 FR-003: AES-256-GCM with the key CONSENT_ENCRYPTION_KEY (32 bytes in base64). The file is iv(12) | tag(16) | data.
// Even if someone obtains the bucket, without the server key they cannot read the consents.
@Injectable()
export class EncryptedConsentVault extends ConsentVault {
  private readonly key: Buffer;

  constructor(
    private readonly storage: FileStorage,
    config: ConfigService,
  ) {
    super();
    this.key = Buffer.from(config.getOrThrow<string>('CONSENT_ENCRYPTION_KEY'), 'base64');
    if (this.key.length !== 32) throw new Error('CONSENT_ENCRYPTION_KEY must be 32 bytes in base64');
  }

  async store(image: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(image), cipher.final()]);
    const path = `consents/${crypto.randomUUID()}.bin`;
    await this.storage.put(path, Buffer.concat([iv, cipher.getAuthTag(), data]), 'application/octet-stream');
    return path;
  }

  async read(path: string) {
    const file = await this.storage.get(path);
    const decipher = createDecipheriv('aes-256-gcm', this.key, file.subarray(0, 12));
    decipher.setAuthTag(file.subarray(12, 28));
    const data = Buffer.concat([decipher.update(file.subarray(28)), decipher.final()]);
    return { data, contentType: detectImageType(data) === 'png' ? 'image/png' : 'image/jpeg' };
  }
}
