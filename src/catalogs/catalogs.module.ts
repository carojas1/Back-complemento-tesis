import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { CreateCatalogItemUseCase } from './application/create-catalog-item.use-case';
import { DeleteCatalogItemUseCase } from './application/delete-catalog-item.use-case';
import { ListCatalogUseCase } from './application/list-catalog.use-case';
import { UpdateCatalogItemUseCase } from './application/update-catalog-item.use-case';
import { CatalogsRepository } from './domain/ports/catalogs.repository';
import { CatalogsController } from './infrastructure/http/catalogs.controller';
import { CatalogsPrismaRepository } from './infrastructure/prisma/catalogs.prisma.repository';

// AuthModule: audit and decorators. Exports the repository (patients validates avatar, diagnosis and conditions)
// and the creation (the initial avatars script).
@Module({
  imports: [AuthModule],
  controllers: [CatalogsController],
  providers: [
    { provide: CatalogsRepository, useClass: CatalogsPrismaRepository },
    ListCatalogUseCase,
    CreateCatalogItemUseCase,
    UpdateCatalogItemUseCase,
    DeleteCatalogItemUseCase,
  ],
  exports: [CatalogsRepository, CreateCatalogItemUseCase],
})
export class CatalogsModule {}
