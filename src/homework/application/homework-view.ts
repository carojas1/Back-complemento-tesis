import { FileStorage } from '../../common/storage/file-storage';
import { HomeworkRow } from '../domain/ports/homework.repository';

// Homework for the panel and family mode: signed URLs (1 hour) for the pictograms.
export async function toHomeworkView({ pictograms, ...row }: HomeworkRow, storage: FileStorage) {
  return {
    ...row,
    pictograms: await Promise.all(
      pictograms.map(async ({ pictogramId, label, imagePath }) => ({ pictogramId, label, imageUrl: await storage.signedUrl(imagePath) })),
    ),
  };
}
