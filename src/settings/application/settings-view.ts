import { FileStorage } from '../../common/storage/file-storage';
import { CenterSettings } from '../domain/entities/center-settings.entity';

const toLogo = async ({ logoPath }: CenterSettings, storage: FileStorage) =>
  logoPath ? { logoUrl: await storage.signedUrl(logoPath) } : {};

// What the admin sees: never the PIN hash, only whether it exists.
export const toSettingsView = async (settings: CenterSettings, storage: FileStorage) => ({
  centerName: settings.centerName,
  hasCenterPin: !!settings.centerPin,
  therapistTimeoutMinutes: settings.therapistTimeoutMinutes,
  registrationCodeMinutes: settings.registrationCodeMinutes,
  updatedAt: settings.updatedAt,
  ...(await toLogo(settings, storage)),
});

// What every member of the center's staff sees in the menu.
export const toBrandingView = async (settings: CenterSettings, storage: FileStorage) => ({
  centerName: settings.centerName,
  ...(await toLogo(settings, storage)),
});

// What the tablet downloads (spec 002): the Center PIN already hashed, to verify it offline.
export const toDeviceSettingsView = ({ centerName, centerPin, therapistTimeoutMinutes }: CenterSettings) => ({
  centerName,
  centerPin,
  therapistTimeoutMinutes,
});
