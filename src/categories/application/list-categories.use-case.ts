import { Injectable } from '@nestjs/common';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { CategoriesRepository } from '../domain/ports/categories.repository';

// Catalog categories for the therapist (inactive ones too), with how many pictograms each has.
@Injectable()
export class ListCategoriesUseCase {
  constructor(private readonly categories: CategoriesRepository) {}

  async execute(page: PageRequest) {
    return mapPage(await this.categories.listCategories(page), ({ category: { id, name, color, sortOrder, active }, pictogramCount }) => ({
      id,
      name,
      color,
      sortOrder,
      active,
      pictogramCount,
    }));
  }
}
