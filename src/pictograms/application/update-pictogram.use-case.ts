import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { WordType } from '../domain/entities/pictogram.entity';
import { PictogramNotFound } from '../domain/exceptions/pictograms.exceptions';
import { PictogramsRepository } from '../domain/ports/pictograms.repository';
import { toPictogramView } from './pictogram-view';

// Label, active flag and word type. An inactive pictogram stops reaching the tablets. Any change bumps the
// version of the profiles that have it, so the tablets receive it on the next sync.
@Injectable()
export class UpdatePictogramUseCase {
  constructor(
    private readonly pictograms: PictogramsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; label?: string; active?: boolean; wordType?: WordType | null; actorId: string; ip?: string }) {
    const pictogram = await this.pictograms.findPictogram(input.id);
    if (!pictogram) throw new PictogramNotFound();

    const changed = pictogram.edit(input);
    if (changed.length > 0) {
      await this.pictograms.savePictogram(pictogram);
      await this.pictograms.touchBoards(pictogram.id);
      await this.audit.record({
        action: 'PICTOGRAM_UPDATE',
        actorType: 'USER',
        actorId: input.actorId,
        entity: 'Pictogram',
        entityId: pictogram.id,
        ip: input.ip,
        summary: { fields: changed, active: pictogram.active },
      });
    }
    return toPictogramView(pictogram, this.storage);
  }
}
