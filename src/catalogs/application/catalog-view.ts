import { FileStorage } from '../../common/storage/file-storage';
import { CatalogItem } from '../domain/entities/catalog-item.entity';

// What goes out to the panel and the tablet: avatars carry their signed URL (1 hour).
export async function toCatalogView({ id, name, active, imagePath }: CatalogItem, storage: FileStorage) {
  return { id, name, active, ...(imagePath ? { imageUrl: await storage.signedUrl(imagePath) } : {}) };
}
