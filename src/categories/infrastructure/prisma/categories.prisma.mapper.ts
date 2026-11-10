import type * as db from '@prisma/client';
import { Category } from '../../domain/entities/category.entity';

// The only place that knows the Prisma shape of a category (reused by vocabulary).
export class CategoriesPrismaMapper {
  static toDomain({ id, name, color, sortOrder, active }: db.Category) {
    return Category.reconstitute({ id, name, color, sortOrder, active });
  }

  static toPrisma(category: Category) {
    return category.toSnapshot();
  }
}
