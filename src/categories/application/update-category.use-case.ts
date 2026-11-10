import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { CategoryChanges } from '../domain/entities/category.entity';
import { CategoryNameTaken, CategoryNotFound } from '../domain/exceptions/categories.exceptions';
import { CategoriesRepository } from '../domain/ports/categories.repository';

// Name, color, order and active flag. Deactivating is the "delete" of the catalogs.
@Injectable()
export class UpdateCategoryUseCase {
  constructor(
    private readonly categories: CategoriesRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: CategoryChanges & { id: string; actorId: string; ip?: string }) {
    const category = await this.categories.findCategory(input.id);
    if (!category) throw new CategoryNotFound();

    const sameName = input.name ? await this.categories.findCategoryByName(input.name.trim()) : null;
    if (sameName && sameName.id !== category.id) throw new CategoryNameTaken();

    const changed = category.edit(input);
    if (changed.length === 0) return category;

    await this.categories.saveCategory(category);
    await this.audit.record({
      action: 'CATEGORY_UPDATE',
      actorType: 'USER',
      actorId: input.actorId,
      entity: 'Category',
      entityId: category.id,
      ip: input.ip,
      summary: { fields: changed, active: category.active },
    });
    return category;
  }
}
