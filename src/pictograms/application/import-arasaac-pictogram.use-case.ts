import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { Pictogram } from '../domain/entities/pictogram.entity';
import { ArasaacPictogramNotFound } from '../domain/exceptions/pictograms.exceptions';
import { ArasaacClient, PictogramsRepository } from '../domain/ports/pictograms.repository';
import { toPictogramView } from './pictogram-view';

// Copies an ARASAAC pictogram into the bucket and saves it (spec 105 FR-001). Idempotent: if it already exists, returns it.
@Injectable()
export class ImportArasaacPictogramUseCase {
  constructor(
    private readonly arasaac: ArasaacClient,
    private readonly pictograms: PictogramsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { arasaacId: number; label?: string; actorId: string | null; ip?: string }) {
    const existing = await this.pictograms.findPictogramByArasaacId(input.arasaacId);
    if (existing) return { created: false, pictogram: await toPictogramView(existing, this.storage) };

    const source = await this.arasaac.find(input.arasaacId);
    if (!source) throw new ArasaacPictogramNotFound();

    const pictogram = Pictogram.fromArasaac(input.arasaacId, input.label?.trim() || source.label, source.wordType);
    await this.storage.put(pictogram.imagePath, await this.arasaac.downloadImage(input.arasaacId), 'image/png');
    await this.pictograms.savePictogram(pictogram);

    await this.audit.record({
      action: 'PICTOGRAM_CREATE',
      actorType: input.actorId ? 'USER' : 'SYSTEM',
      actorId: input.actorId,
      entity: 'Pictogram',
      entityId: pictogram.id,
      ip: input.ip,
      summary: { arasaacId: input.arasaacId, label: pictogram.label },
    });
    return { created: true, pictogram: await toPictogramView(pictogram, this.storage) };
  }
}
