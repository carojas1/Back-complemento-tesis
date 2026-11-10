import { Page, PageRequest } from '../../../common/pagination/page';
import { Pictogram, WordType } from '../entities/pictogram.entity';

export abstract class PictogramsRepository {
  abstract findPictogram(id: string): Promise<Pictogram | null>;
  abstract findPictograms(ids: string[]): Promise<Pictogram[]>;
  abstract findPictogramByArasaacId(arasaacId: number): Promise<Pictogram | null>;
  abstract findPictogramsByArasaacIds(arasaacIds: number[]): Promise<Pictogram[]>;
  // No query: all, by label.
  abstract searchPictograms(query: string | undefined, page: PageRequest): Promise<Page<Pictogram>>;
  abstract savePictogram(pictogram: Pictogram): Promise<void>;
  // Bumps the version of the profiles that have this pictogram: the tablets download their board again.
  abstract touchBoards(pictogramId: string): Promise<void>;
}

export interface ArasaacPictogram {
  arasaacId: number;
  label: string; // first keyword in Spanish
  wordType: WordType | null; // from the type of that keyword
  previewUrl: string; // public ARASAAC image for the search preview
}

// Public ARASAAC API (spec 105). Throws ArasaacUnavailable if it does not respond.
export abstract class ArasaacClient {
  abstract search(query: string): Promise<ArasaacPictogram[]>;
  abstract find(arasaacId: number): Promise<ArasaacPictogram | null>;
  abstract downloadImage(arasaacId: number): Promise<Buffer>;
}
