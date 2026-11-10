import { FileStorage } from '../../common/storage/file-storage';
import { Pictogram } from '../domain/entities/pictogram.entity';

// What goes out to the web and the tablet: the database stores the path, here the URL is signed (1 hour).
// Also used by categories and vocabulary.
export async function toPictogramView(pictogram: Pictogram, storage: FileStorage) {
  const { id, arasaacId, label, wordType, active } = pictogram;
  return { id, arasaacId, label, wordType, active, imageUrl: await storage.signedUrl(pictogram.imagePath) };
}
