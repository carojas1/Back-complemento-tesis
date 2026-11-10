import { Injectable, Logger } from '@nestjs/common';
import { AuthAuditAction, AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { detectImageType, imageSize } from '../../pictograms/domain/entities/pictogram.entity';
import { currentInstitution } from '../../tenancy/tenancy';
import { InvalidLogo } from '../domain/exceptions/settings.exceptions';
import { SettingsRepository } from '../domain/ports/settings.repository';
import { toSettingsView } from './settings-view';

export const maxLogoBytes = 512_000;
const maxLogoSide = 2048;

// The type comes from the bytes and the name from the server, so nothing the client sends reaches the path or the
// content type. SVG is refused on purpose: it can carry scripts.
@Injectable()
export class SetCenterLogoUseCase {
  private readonly logger = new Logger(SetCenterLogoUseCase.name);

  constructor(
    private readonly settings: SettingsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async set(input: { image?: Buffer; adminId: string; ip?: string }) {
    const type = input.image && input.image.length <= maxLogoBytes ? detectImageType(input.image) : null;
    const size = type && imageSize(input.image!, type);
    if (!input.image || !type || !size || size.width > maxLogoSide || size.height > maxLogoSide) throw new InvalidLogo();

    const logoPath = `logos/${currentInstitution()}/${crypto.randomUUID()}.${type === 'png' ? 'png' : 'jpg'}`;
    await this.storage.put(logoPath, input.image, type === 'png' ? 'image/png' : 'image/jpeg');
    return this.replace(logoPath, 'CENTER_LOGO_SET', input);
  }

  remove(input: { adminId: string; ip?: string }) {
    return this.replace(null, 'CENTER_LOGO_REMOVE', input);
  }

  private async replace(logoPath: string | null, action: AuthAuditAction, input: { adminId: string; ip?: string }) {
    const settings = await this.settings.get();
    const previous = settings.logoPath;
    settings.setLogo(logoPath);
    const saved = await this.settings.save(settings);
    await this.audit.record({ action, actorType: 'USER', actorId: input.adminId, entity: 'CenterSettings', ip: input.ip, summary: {} });
    if (previous) await this.storage.remove(previous).catch((error: Error) => this.logger.warn(error.message));
    return toSettingsView(saved, this.storage);
  }
}
