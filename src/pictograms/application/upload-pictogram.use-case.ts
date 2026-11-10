import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { detectImageType, Pictogram, WordType } from '../domain/entities/pictogram.entity';
import { InvalidImage } from '../domain/exceptions/pictograms.exceptions';
import { PictogramsRepository } from '../domain/ports/pictograms.repository';
import { toPictogramView } from './pictogram-view';

// The therapist's own image (agreed 2026-10-21): PNG or JPEG up to 1 MB, verified by its bytes.
@Injectable()
export class UploadPictogramUseCase {
  constructor(
    private readonly pictograms: PictogramsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { label: string; wordType?: WordType; image?: Buffer; actorId: string; ip?: string }) {
    const type = input.image && input.image.length <= 1_000_000 ? detectImageType(input.image) : null;
    if (!input.image || !type) throw new InvalidImage();

    const pictogram = Pictogram.uploaded(input.label, type, input.wordType ?? null);
    await this.storage.put(pictogram.imagePath, input.image, type === 'png' ? 'image/png' : 'image/jpeg');
    await this.pictograms.savePictogram(pictogram);

    await this.audit.record({
      action: 'PICTOGRAM_CREATE',
      actorType: 'USER',
      actorId: input.actorId,
      entity: 'Pictogram',
      entityId: pictogram.id,
      ip: input.ip,
      summary: { label: pictogram.label, source: 'upload' },
    });
    return toPictogramView(pictogram, this.storage);
  }
}
