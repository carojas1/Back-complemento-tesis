import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { detectImageType } from '../../pictograms/domain/entities/pictogram.entity';
import { CatalogItem, catalogEntity, CatalogKind } from '../domain/entities/catalog-item.entity';
import { AvatarsAdminOnly, CatalogNameTaken, InvalidAvatarImage } from '../domain/exceptions/catalogs.exceptions';
import { CatalogsRepository } from '../domain/ports/catalogs.repository';
import { toCatalogView } from './catalog-view';

// SVG by its text, PNG or JPEG by their first bytes: the client's mimetype is not trusted.
// The bucket serves SVG as image/svg+xml and a browser runs what it carries, so only drawing elements pass: a list of what is allowed, because
// a list of what is forbidden misses things like "java&#115;cript:" or <set attributeName="onload">.
const svgDrawingElements = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
]);
const isSafeSvg = (text: string) =>
  /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(text) &&
  !/<!|&#|\son\w+\s*=|href\s*=|javascript:|url\((?!\s*['"]?#)/i.test(text) &&
  [...text.matchAll(/<\s*([a-zA-Z][\w:.-]*)/g)].every(([, name]) => svgDrawingElements.has(name.toLowerCase()));
const imageType = (bytes: Buffer) => detectImageType(bytes) ?? (isSafeSvg(bytes.toString()) ? 'svg' : null);
const contentTypes = { svg: 'image/svg+xml', png: 'image/png', jpeg: 'image/jpeg' };

// Adds an item to a catalog. Avatars come with their image (SVG, PNG or JPEG, up to 200 KB) and only the admin creates them.
@Injectable()
export class CreateCatalogItemUseCase {
  constructor(
    private readonly catalogs: CatalogsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { kind: CatalogKind; name: string; image?: Buffer; actorId: string | null; actorRole: Role | null; ip?: string }) {
    if (input.kind === 'avatars' && input.actorRole !== null && input.actorRole !== Role.ADMIN) throw new AvatarsAdminOnly();
    if (await this.catalogs.findByName(input.kind, input.name.trim())) throw new CatalogNameTaken();

    let imagePath: string | null = null;
    if (input.kind === 'avatars') {
      const type = input.image && input.image.length <= 200_000 ? imageType(input.image) : null;
      if (!input.image || !type) throw new InvalidAvatarImage();
      imagePath = `avatars/${crypto.randomUUID()}.${type === 'jpeg' ? 'jpg' : type}`;
      await this.storage.put(imagePath, input.image, contentTypes[type]);
    }

    const item = CatalogItem.create(input.name, imagePath);
    await this.catalogs.save(input.kind, item);
    await this.audit.record({
      action: 'CATALOG_CREATE',
      actorType: input.actorId ? 'USER' : 'SYSTEM', // null: initial load by script
      actorId: input.actorId,
      entity: catalogEntity[input.kind],
      entityId: item.id,
      ip: input.ip,
      summary: { name: item.name },
    });
    return toCatalogView(item, this.storage);
  }
}
