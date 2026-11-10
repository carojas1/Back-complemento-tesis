import { Injectable } from '@nestjs/common';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { CatalogKind } from '../domain/entities/catalog-item.entity';
import { CatalogsRepository } from '../domain/ports/catalogs.repository';
import { toCatalogView } from './catalog-view';

@Injectable()
export class ListCatalogUseCase {
  constructor(
    private readonly catalogs: CatalogsRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(kind: CatalogKind, page: PageRequest, onlyActive: boolean) {
    return mapPage(await this.catalogs.list(kind, page, onlyActive), (item) => toCatalogView(item, this.storage));
  }
}
