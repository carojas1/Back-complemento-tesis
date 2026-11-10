import { CatalogItem } from '../../domain/entities/catalog-item.entity';

type Row = { id: string; name: string; active: boolean; imagePath?: string };

// The only place that knows the Prisma shape of the three catalogs (only Avatar has an image).
export class CatalogsPrismaMapper {
  static toDomain({ id, name, active, imagePath }: Row) {
    return CatalogItem.reconstitute({ id, name, active, imagePath: imagePath ?? null });
  }

  static toPrisma(item: CatalogItem) {
    const { id, name, active, imagePath } = item.toSnapshot();
    return imagePath ? { id, name, active, imagePath } : { id, name, active };
  }
}
