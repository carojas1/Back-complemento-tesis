import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { Category } from '../domain/entities/category.entity';
import { CategoryNameTaken } from '../domain/exceptions/categories.exceptions';
import { CategoriesRepository } from '../domain/ports/categories.repository';

@Injectable()
export class CreateCategoryUseCase {
  constructor(
    private readonly categories: CategoriesRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { name: string; color: string; sortOrder?: number; actorId: string | null; ip?: string }) {
    if (await this.categories.findCategoryByName(input.name.trim())) throw new CategoryNameTaken();

    const category = Category.create(input);
    await this.categories.saveCategory(category);
    await this.audit.record({
      action: 'CATEGORY_CREATE',
      actorType: input.actorId ? 'USER' : 'SYSTEM', // null: basic-vocabulary script
      actorId: input.actorId,
      entity: 'Category',
      entityId: category.id,
      ip: input.ip,
      summary: { name: category.name },
    });
    return category;
  }
}
