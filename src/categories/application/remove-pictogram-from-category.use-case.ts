import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { CategoryNotFound } from '../domain/exceptions/categories.exceptions';
import { CategoriesRepository } from '../domain/ports/categories.repository';

// Removes a pictogram from the category. The pictogram stays in the catalog (to delete it, deactivate it).
@Injectable()
export class RemovePictogramFromCategoryUseCase {
  constructor(
    private readonly categories: CategoriesRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { categoryId: string; pictogramId: string; actorId: string; ip?: string }) {
    if (!(await this.categories.findCategory(input.categoryId))) throw new CategoryNotFound();

    await this.categories.removeFromCategory(input.categoryId, input.pictogramId);
    await this.audit.record({
      action: 'CATEGORY_PICTOGRAMS_SET',
      actorType: 'USER',
      actorId: input.actorId,
      entity: 'Category',
      entityId: input.categoryId,
      ip: input.ip,
      summary: { removed: input.pictogramId },
    });
  }
}
