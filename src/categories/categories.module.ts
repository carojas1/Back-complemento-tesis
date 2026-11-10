import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { PictogramsModule } from '../pictograms/pictograms.module';
import { AddPictogramToCategoryUseCase } from './application/add-pictogram-to-category.use-case';
import { CreateCategoryUseCase } from './application/create-category.use-case';
import { ListCategoriesUseCase } from './application/list-categories.use-case';
import { ListCategoryPictogramsUseCase } from './application/list-category-pictograms.use-case';
import { RemovePictogramFromCategoryUseCase } from './application/remove-pictogram-from-category.use-case';
import { ReplaceCategoryPictogramsUseCase } from './application/replace-category-pictograms.use-case';
import { UpdateCategoryUseCase } from './application/update-category.use-case';
import { CategoriesRepository } from './domain/ports/categories.repository';
import { CategoriesController } from './infrastructure/http/categories.controller';
import { CategoriesPrismaRepository } from './infrastructure/prisma/categories.prisma.repository';

// AuthModule: audit and decorators. PictogramsModule: validate that the pictograms exist.
@Module({
  imports: [AuthModule, PictogramsModule],
  controllers: [CategoriesController],
  providers: [
    { provide: CategoriesRepository, useClass: CategoriesPrismaRepository },
    ListCategoriesUseCase,
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    ListCategoryPictogramsUseCase,
    ReplaceCategoryPictogramsUseCase,
    AddPictogramToCategoryUseCase,
    RemovePictogramFromCategoryUseCase,
  ],
  // The basic-vocabulary script creates categories and assigns pictograms to them.
  exports: [CategoriesRepository, CreateCategoryUseCase, ReplaceCategoryPictogramsUseCase],
})
export class CategoriesModule {}
