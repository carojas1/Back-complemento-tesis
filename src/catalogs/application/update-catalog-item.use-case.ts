import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { CatalogItemChanges, catalogEntity, CatalogKind } from '../domain/entities/catalog-item.entity';
import { AvatarsAdminOnly, CatalogItemNotFound, CatalogNameTaken } from '../domain/exceptions/catalogs.exceptions';
import { CatalogsRepository } from '../domain/ports/catalogs.repository';
import { toCatalogView } from './catalog-view';

// Name and active flag. Deactivating stops offering it, but whoever already has it keeps it.
@Injectable()
export class UpdateCatalogItemUseCase {
  constructor(
    private readonly catalogs: CatalogsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: CatalogItemChanges & { kind: CatalogKind; id: string; actorId: string; actorRole: Role; ip?: string }) {
    if (input.kind === 'avatars' && input.actorRole !== Role.ADMIN) throw new AvatarsAdminOnly();
    const item = await this.catalogs.find(input.kind, input.id);
    if (!item) throw new CatalogItemNotFound();
    const sameName = input.name ? await this.catalogs.findByName(input.kind, input.name.trim()) : null;
    if (sameName && sameName.id !== item.id) throw new CatalogNameTaken();

    const changed = item.edit(input);
    if (changed.length > 0) {
      await this.catalogs.save(input.kind, item);
      await this.audit.record({
        action: 'CATALOG_UPDATE',
        actorType: 'USER',
        actorId: input.actorId,
        entity: catalogEntity[input.kind],
        entityId: item.id,
        ip: input.ip,
        summary: { fields: changed, active: item.active },
      });
    }
    return toCatalogView(item, this.storage);
  }
}
