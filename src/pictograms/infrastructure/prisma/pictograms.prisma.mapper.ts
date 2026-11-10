import type * as db from '@prisma/client';
import { Pictogram } from '../../domain/entities/pictogram.entity';

// The only place that knows the Prisma shape of a pictogram (reused by categories and vocabulary).
export class PictogramsPrismaMapper {
  static toDomain({ id, arasaacId, label, imagePath, wordType, active, createdAt }: db.Pictogram) {
    return Pictogram.reconstitute({ id, arasaacId, label, imagePath, wordType, active, createdAt });
  }

  static toPrisma(pictogram: Pictogram) {
    return pictogram.toSnapshot();
  }
}
