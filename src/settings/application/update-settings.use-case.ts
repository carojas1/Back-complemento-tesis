import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { SettingsChanges } from '../domain/entities/center-settings.entity';
import { SettingsRepository } from '../domain/ports/settings.repository';
import { toSettingsView } from './settings-view';

// Spec 103 FR-008: the admin changes the Center name, the therapist-mode inactivity timeout or the validity of the
// code. Tablets receive it on the next sync. It is audited.
@Injectable()
export class UpdateSettingsUseCase {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly audit: AuthAuditLog,
    private readonly storage: FileStorage,
  ) {}

  async execute(input: { changes: SettingsChanges; adminId: string; ip?: string }) {
    const settings = await this.settings.get();
    settings.edit(input.changes);
    const saved = await this.settings.save(settings);
    await this.audit.record({
      action: 'SETTINGS_UPDATE',
      actorType: 'USER',
      actorId: input.adminId,
      entity: 'CenterSettings',
      ip: input.ip,
      summary: { changed: Object.keys(input.changes) },
    });
    return toSettingsView(saved, this.storage);
  }
}
