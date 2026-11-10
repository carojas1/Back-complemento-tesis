import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { CategoryNotFound, UnknownPictograms } from '../domain/exceptions/categories.exceptions';
import { PictogramsRepository } from '../../pictograms/domain/ports/pictograms.repository';
import { CategoriesRepository } from '../domain/ports/categories.repository';

// Replaces the pictograms of a category; the array order is the order on the board (drag and drop).
@Injectable()
export class ReplaceCategoryPictogramsUseCase {
  constructor(
    private readonly categories: CategoriesRepository,
    private readonly pictograms: PictogramsRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; pictogramIds: string[]; actorId: string | null; ip?: string }) {
    if (!(await this.categories.findCategory(input.id))) throw new CategoryNotFound();

    const ids = [...new Set(input.pictogramIds)];
    const found = await this.pictograms.findPictograms(ids);
    if (found.length !== ids.length) throw new UnknownPictograms(ids.length - found.length);

    await this.categories.replaceCategoryPictograms(input.id, ids);
    await this.audit.record({
      action: 'CATEGORY_PICTOGRAMS_SET',
      actorType: input.actorId ? 'USER' : 'SYSTEM', // null: basic-vocabulary script
      actorId: input.actorId,
      entity: 'Category',
      entityId: input.id,
      ip: input.ip,
      summary: { pictograms: ids.length },
    });
  }
}
