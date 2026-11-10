import { Injectable } from '@nestjs/common';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { CategoryNotFound } from '../domain/exceptions/categories.exceptions';
import { CategoriesRepository } from '../domain/ports/categories.repository';
import { toPictogramView } from '../../pictograms/application/pictogram-view';

// Pictograms of a category in order, with signed URLs only for the requested page.
@Injectable()
export class ListCategoryPictogramsUseCase {
  constructor(
    private readonly categories: CategoriesRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(categoryId: string, page: PageRequest) {
    if (!(await this.categories.findCategory(categoryId))) throw new CategoryNotFound();
    return mapPage(await this.categories.listCategoryPictograms(categoryId, page), (p) => toPictogramView(p, this.storage));
  }
}
