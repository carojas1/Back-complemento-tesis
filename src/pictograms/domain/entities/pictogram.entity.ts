// Word type (agreed 2026-10-25): the board opens the category that usually follows in the sentence. From ARASAAC comes the
// type of its first keyword; the therapist corrects it.
export const wordTypes = ['PERSON', 'THING', 'ACTION', 'DESCRIPTOR', 'SOCIAL', 'OTHER'] as const;
export type WordType = (typeof wordTypes)[number];
const arasaacWordTypes: Record<number, WordType> = { 1: 'PERSON', 2: 'THING', 3: 'ACTION', 4: 'DESCRIPTOR', 5: 'SOCIAL', 6: 'OTHER' };
// ARASAAC marks «mamá», «papá» or «maestro» as a common noun, just like «agua». Its tags tell them apart, but the
// `person` tag alone is not enough: «comer», «casa» or «ayuda» also carry it because the drawing shows someone. A
// common noun is a person if it is family, a professional or a living being with `person` that is not an animal.
const isPersonNoun = (tags: string[], categories: string[]) =>
  tags.includes('family') ||
  tags.includes('professional') ||
  (tags.includes('person') && !tags.includes('animal') && categories.includes('core vocabulary-living being'));
export const wordTypeFromArasaac = (type: number | undefined, tags: string[] = [], categories: string[] = []): WordType | null =>
  type === 2 && isPersonNoun(tags, categories) ? 'PERSON' : type ? (arasaacWordTypes[type] ?? null) : null;

export interface PictogramProps {
  id: string;
  arasaacId: number | null; // null: image uploaded by the therapist
  label: string;
  imagePath: string; // path inside the bucket, never the URL (spec 105 FR-006)
  wordType: WordType | null; // null: unclassified (the board does not switch category when it is tapped)
  active: boolean;
  createdAt: Date;
}

export type ImageType = 'png' | 'jpeg';

// Maximum side of an uploaded image (spec 113 FR-011): an image small in bytes but huge in pixels would exhaust the
// tablet's memory when drawn (OWASP ASVS 5.2.6).
export const maxImageSide = 4096;

// Width and height read from the header, without decoding the image. PNG: the IHDR chunk; JPEG: the first SOF marker.
export function imageSize(bytes: Uint8Array, type: ImageType) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'png') return bytes.length >= 24 ? { width: view.getUint32(16), height: view.getUint32(20) } : null;
  for (let i = 2; i + 9 < bytes.length;) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++; // relleno
      continue;
    }
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    i += 2 + view.getUint16(i + 2);
  }
  return null;
}

// Real image type from its first bytes (the mimetype the client sends is not trusted); null if it is neither PNG nor
// JPEG or if it exceeds 4096 px per side.
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const type =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      ? 'png'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? 'jpeg'
        : null;
  const size = type && imageSize(bytes, type);
  return size && size.width > 0 && size.height > 0 && size.width <= maxImageSide && size.height <= maxImageSide ? type : null;
}

// Pictogram saved on the server (spec 105 FR-001): an ARASAAC copy or an own image. Never deleted: it is deactivated.
export interface Pictogram extends Readonly<PictogramProps> {}
export class Pictogram {
  private constructor(props: PictogramProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: PictogramProps) {
    return new Pictogram(props);
  }

  static fromArasaac(arasaacId: number, label: string, wordType: WordType | null = null) {
    return Pictogram.create(label, `pictograms/arasaac/${arasaacId}.png`, arasaacId, wordType);
  }

  static uploaded(label: string, type: ImageType, wordType: WordType | null = null) {
    return Pictogram.create(label, `pictograms/uploads/${crypto.randomUUID()}.${type === 'png' ? 'png' : 'jpg'}`, null, wordType);
  }

  private static create(label: string, imagePath: string, arasaacId: number | null, wordType: WordType | null) {
    return new Pictogram({
      id: crypto.randomUUID(),
      arasaacId,
      label: label.trim(),
      imagePath,
      wordType,
      active: true,
      createdAt: new Date(),
    });
  }

  // Returns the fields that changed. `wordType: null` leaves it unclassified.
  edit(changes: { label?: string; active?: boolean; wordType?: WordType | null }) {
    const changed: string[] = [];
    if (changes.label !== undefined && changes.label.trim() !== this.label) changed.push('label');
    if (changes.active !== undefined && changes.active !== this.active) changed.push('active');
    if (changes.wordType !== undefined && changes.wordType !== this.wordType) changed.push('wordType');
    Object.assign(this, {
      label: changes.label?.trim() ?? this.label,
      active: changes.active ?? this.active,
      wordType: changes.wordType !== undefined ? changes.wordType : this.wordType,
    });
    return changed;
  }

  toSnapshot(): PictogramProps {
    return { ...this };
  }
}
