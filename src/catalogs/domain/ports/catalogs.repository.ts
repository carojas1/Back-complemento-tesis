import { Page, PageRequest } from '../../../common/pagination/page';
import { CatalogItem, CatalogKind } from '../entities/catalog-item.entity';

export abstract class CatalogsRepository {
  abstract list(kind: CatalogKind, page: PageRequest, onlyActive: boolean): Promise<Page<CatalogItem>>;
  abstract find(kind: CatalogKind, id: string): Promise<CatalogItem | null>;
  abstract findByName(kind: CatalogKind, name: string): Promise<CatalogItem | null>;
  abstract findMany(kind: CatalogKind, ids: string[]): Promise<CatalogItem[]>;
  abstract save(kind: CatalogKind, item: CatalogItem): Promise<void>;
  // Does any patient use it? Decides whether deleting removes or deactivates.
  abstract isInUse(kind: CatalogKind, id: string): Promise<boolean>;
  abstract delete(kind: CatalogKind, id: string): Promise<void>;
}
