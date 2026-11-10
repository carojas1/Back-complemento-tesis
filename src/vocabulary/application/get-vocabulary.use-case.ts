import { Injectable } from '@nestjs/common';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { toPictogramView } from '../../pictograms/application/pictogram-view';
import { CategoryWithPictograms, VocabularyRepository } from '../domain/ports/vocabulary.repository';

// What the tablet downloads: active categories with their active pictograms. The tablet walks through the pages.
@Injectable()
export class GetVocabularyUseCase {
  constructor(
    private readonly vocabulary: VocabularyRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(page: PageRequest) {
    return mapPage(await this.vocabulary.listVocabulary(page), (item) => this.toView(item));
  }

  private async toView({ category: { id, name, color, sortOrder }, pictograms }: CategoryWithPictograms) {
    return { id, name, color, sortOrder, pictograms: await Promise.all(pictograms.map((p) => toPictogramView(p, this.storage))) };
  }
}
