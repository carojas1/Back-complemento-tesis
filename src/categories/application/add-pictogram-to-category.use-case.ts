import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { PictogramNotFound } from '../../pictograms/domain/exceptions/pictograms.exceptions';
import { PictogramsRepository } from '../../pictograms/domain/ports/pictograms.repository';
import { CategoryNotFound } from '../domain/exceptions/categories.exceptions';
import { CategoriesRepository } from '../domain/ports/categories.repository';

// Appends a pictogram to the end of the category without the client having to send the full list.
@Injectable()
export class AddPictogramToCategoryUseCase {
  constructor(
    private readonly categories: CategoriesRepository,
    private readonly pictograms: PictogramsRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { categoryId: string; pictogramId: string; actorId: string; ip?: string }) {
    if (!(await this.categories.findCategory(input.categoryId))) throw new CategoryNotFound();
    if (!(await this.pictograms.findPictogram(input.pictogramId))) throw new PictogramNotFound();

    await this.categories.addToCategory(input.categoryId, input.pictogramId);
    await this.audit.record({
      action: 'CATEGORY_PICTOGRAMS_SET',
      actorType: 'USER',
      actorId: input.actorId,
      entity: 'Category',
      entityId: input.categoryId,
      ip: input.ip,
      summary: { added: input.pictogramId },
    });
  }
}
