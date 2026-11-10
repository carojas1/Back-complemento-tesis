import { Page, PageRequest } from '../../../common/pagination/page';
import { Pictogram } from '../../../pictograms/domain/entities/pictogram.entity';
import { Category } from '../entities/category.entity';

export interface CategorySummary {
  category: Category;
  pictogramCount: number;
}

export abstract class CategoriesRepository {
  // All categories (inactive ones too), without their pictograms.
  abstract listCategories(page: PageRequest): Promise<Page<CategorySummary>>;
  abstract findCategory(id: string): Promise<Category | null>;
  abstract findCategoryByName(name: string): Promise<Category | null>;
  abstract saveCategory(category: Category): Promise<void>;

  // Pictograms of a category, in order.
  abstract listCategoryPictograms(categoryId: string, page: PageRequest): Promise<Page<Pictogram>>;
  // Replaces the category's pictograms in a transaction; the array order is the order.
  abstract replaceCategoryPictograms(categoryId: string, pictogramIds: string[]): Promise<void>;
  // Appends to the end (if already there, does nothing) / removes it from the category; the pictogram is not deleted.
  abstract addToCategory(categoryId: string, pictogramId: string): Promise<void>;
  abstract removeFromCategory(categoryId: string, pictogramId: string): Promise<void>;
}
