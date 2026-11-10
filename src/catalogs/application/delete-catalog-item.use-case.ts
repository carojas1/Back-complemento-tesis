import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { catalogEntity, CatalogKind } from '../domain/entities/catalog-item.entity';
import { AvatarsAdminOnly, CatalogItemNotFound } from '../domain/exceptions/catalogs.exceptions';
import { CatalogsRepository } from '../domain/ports/catalogs.repository';

// Delete (agreed 2026-10-23): if unused it is really deleted (and its image); if in use it is deactivated so records do not break.
@Injectable()
export class DeleteCatalogItemUseCase {
  constructor(
    private readonly catalogs: CatalogsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { kind: CatalogKind; id: string; actorId: string; actorRole: Role; ip?: string }) {
    if (input.kind === 'avatars' && input.actorRole !== Role.ADMIN) throw new AvatarsAdminOnly();
    const item = await this.catalogs.find(input.kind, input.id);
    if (!item) throw new CatalogItemNotFound();

    const inUse = await this.catalogs.isInUse(input.kind, input.id);
    if (inUse) {
      item.deactivate();
      await this.catalogs.save(input.kind, item);
    } else {
      await this.catalogs.delete(input.kind, input.id);
      if (item.imagePath) await this.storage.remove(item.imagePath);
    }
    await this.audit.record({
      action: 'CATALOG_DELETE',
      actorType: 'USER',
      actorId: input.actorId,
      entity: catalogEntity[input.kind],
      entityId: item.id,
      ip: input.ip,
      summary: { name: item.name, deleted: !inUse },
    });
    return { deleted: !inUse, deactivated: inUse };
  }
}
