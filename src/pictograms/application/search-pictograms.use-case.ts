import { Injectable } from '@nestjs/common';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { PictogramsRepository } from '../domain/ports/pictograms.repository';
import { toPictogramView } from './pictogram-view';

// Pictograms already saved on the server, by label (no word: all).
@Injectable()
export class SearchPictogramsUseCase {
  constructor(
    private readonly pictograms: PictogramsRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(query: string | undefined, page: PageRequest) {
    return mapPage(await this.pictograms.searchPictograms(query?.trim() || undefined, page), (p) => toPictogramView(p, this.storage));
  }
}
