// Platform files (images, recordings, consents). The database stores only the path;
// whoever reads asks for a signed, temporary URL (spec 105 FR-006).
export abstract class FileStorage {
  abstract put(path: string, body: Buffer, contentType: string): Promise<void>;
  // `seconds`: validity of the URL (1 hour if not given).
  abstract signedUrl(path: string, seconds?: number): Promise<string>;
  // Direct read by the API (e.g. the encrypted consent, which is not delivered by URL).
  abstract get(path: string): Promise<Buffer>;
  abstract remove(path: string): Promise<void>;
}
