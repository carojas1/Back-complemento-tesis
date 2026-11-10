import { Category } from '../../../categories/domain/entities/category.entity';
import { Page, PageRequest } from '../../../common/pagination/page';
import { Pictogram } from '../../../pictograms/domain/entities/pictogram.entity';

export interface CategoryWithPictograms {
  category: Category;
  pictograms: Pictogram[]; // in the category's order
}

// What the tablet reads: active categories with their active pictograms.
export abstract class VocabularyRepository {
  abstract listVocabulary(page: PageRequest): Promise<Page<CategoryWithPictograms>>;
}
