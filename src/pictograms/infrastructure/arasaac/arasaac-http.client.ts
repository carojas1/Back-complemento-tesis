import { Injectable } from '@nestjs/common';
import { httpClient } from '../../../common/http/http-client';
import { wordTypeFromArasaac } from '../../domain/entities/pictogram.entity';
import { ArasaacUnavailable } from '../../domain/exceptions/pictograms.exceptions';
import { ArasaacClient, ArasaacPictogram } from '../../domain/ports/pictograms.repository';
import { arasaacApi, arasaacStatic } from './arasaac.endpoints';

type ArasaacRaw = { _id: number; keywords?: { keyword: string; type?: number }[]; tags?: string[]; categories?: string[] };

const api = httpClient(arasaacApi.baseUrl, 10_000);
const images = httpClient(arasaacStatic.baseUrl, 10_000);
const toPictogram = (raw: ArasaacRaw): ArasaacPictogram => ({
  arasaacId: raw._id,
  label: raw.keywords?.[0]?.keyword ?? String(raw._id),
  wordType: wordTypeFromArasaac(raw.keywords?.[0]?.type, raw.tags, raw.categories),
  previewUrl: arasaacStatic.baseUrl + arasaacStatic.image(raw._id, 300),
});

// Any network failure, timeout or 5xx is treated as "ARASAAC does not respond".
const orUnavailable = <T>(request: Promise<T>) =>
  request.catch(() => {
    throw new ArasaacUnavailable();
  });

// Public ARASAAC API (CC BY-NC-SA, author Sergio Palao; the attribution is shown by the web, spec 105 FR-002).
// ponytail: in-memory search cache per process; moves to Redis with spec 106.
@Injectable()
export class ArasaacHttpClient extends ArasaacClient {
  private readonly cache = new Map<string, { at: number; results: ArasaacPictogram[] }>();

  async search(query: string) {
    const key = query.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 24 * 60 * 60_000) return hit.results; // 24 horas

    const raw = await orUnavailable(api.getOrNull<ArasaacRaw[]>(arasaacApi.search(query)));
    const results = (raw ?? []).map(toPictogram); // paginated in the use case
    this.cache.set(key, { at: Date.now(), results });
    return results;
  }

  async find(arasaacId: number) {
    const raw = await orUnavailable(api.getOrNull<ArasaacRaw>(arasaacApi.pictogram(arasaacId)));
    return raw ? toPictogram(raw) : null;
  }

  async downloadImage(arasaacId: number) {
    return Buffer.from(await orUnavailable(images.get<ArrayBuffer>(arasaacStatic.image(arasaacId, 500), { responseType: 'arraybuffer' })));
  }
}
