import { Injectable } from '@nestjs/common';
import { mapPage, PageRequest, skipOf, toPage } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { ArasaacUnavailable } from '../domain/exceptions/pictograms.exceptions';
import { ArasaacClient, PictogramsRepository } from '../domain/ports/pictograms.repository';
import { toPictogramView } from './pictogram-view';

// ARASAAC search (spec 105), paginated over the cached results. Flags the ones already saved.
// If ARASAAC does not respond, returns the matching saved ones (with imageUrl) and arasaacAvailable = false.
@Injectable()
export class SearchArasaacUseCase {
  constructor(
    private readonly arasaac: ArasaacClient,
    private readonly pictograms: PictogramsRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(query: string, page: PageRequest) {
    try {
      const results = await this.arasaac.search(query.trim());
      const items = results.slice(skipOf(page), skipOf(page) + page.limit);
      const saved = await this.pictograms.findPictogramsByArasaacIds(items.map((r) => r.arasaacId));
      const savedIds = new Set(saved.map((p) => p.arasaacId));
      return {
        arasaacAvailable: true,
        ...toPage(
          items.map((r) => ({ ...r, saved: savedIds.has(r.arasaacId) })),
          results.length,
          page,
        ),
      };
    } catch (error) {
      if (!(error instanceof ArasaacUnavailable)) throw error;
      const saved = await this.pictograms.searchPictograms(query.trim(), page);
      return { arasaacAvailable: false, ...(await mapPage(saved, (p) => toPictogramView(p, this.storage))) };
    }
  }
}
