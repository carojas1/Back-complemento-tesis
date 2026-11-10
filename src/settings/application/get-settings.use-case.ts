import { Injectable } from '@nestjs/common';
import { FileStorage } from '../../common/storage/file-storage';
import { SettingsRepository } from '../domain/ports/settings.repository';
import { toBrandingView, toDeviceSettingsView, toSettingsView } from './settings-view';

// Spec 103 FR-008: the Center settings for the admin and the ones each tablet downloads.
@Injectable()
export class GetSettingsUseCase {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly storage: FileStorage,
  ) {}

  async forAdmin() {
    return toSettingsView(await this.settings.get(), this.storage);
  }

  async branding() {
    return toBrandingView(await this.settings.get(), this.storage);
  }

  async forDevice() {
    return toDeviceSettingsView(await this.settings.get());
  }
}
