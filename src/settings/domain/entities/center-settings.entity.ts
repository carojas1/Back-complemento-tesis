import { InvalidSetting } from '../exceptions/settings.exceptions';

// Center PIN already hashed (PBKDF2-SHA256), in the format the tablet verifies.
export interface CenterPinHash {
  salt: string;
  hash: string;
  iterations: number;
}

export interface CenterSettingsProps {
  centerName: string;
  centerPin: CenterPinHash | null; // one for all tablets (spec 002 FR-002)
  therapistTimeoutMinutes: number; // therapist-mode inactivity timeout on the tablet
  registrationCodeMinutes: number; // validity of a tablet registration code
  logoPath: string | null; // path in the bucket; the tablets never read it
  updatedAt: Date;
}

export type SettingsChanges = Partial<Pick<CenterSettingsProps, 'centerName' | 'therapistTimeoutMinutes' | 'registrationCodeMinutes'>>;

// Center settings (spec 103 FR-008): a single one per installation, adjusted by the admin.
export interface CenterSettings extends Readonly<CenterSettingsProps> {}
export class CenterSettings {
  private constructor(props: CenterSettingsProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: CenterSettingsProps) {
    return new CenterSettings(props);
  }

  edit({ centerName, therapistTimeoutMinutes, registrationCodeMinutes }: SettingsChanges) {
    const name = centerName?.trim();
    if (name !== undefined && (name.length < 2 || name.length > 80))
      throw new InvalidSetting('El nombre del Centro debe tener de 2 a 80 caracteres');
    if (therapistTimeoutMinutes !== undefined && !(therapistTimeoutMinutes >= 1 && therapistTimeoutMinutes <= 30))
      throw new InvalidSetting('La inactividad del modo terapeuta va de 1 a 30 minutos');
    if (registrationCodeMinutes !== undefined && !(registrationCodeMinutes >= 5 && registrationCodeMinutes <= 60))
      throw new InvalidSetting('La vigencia del código va de 5 a 60 minutos');
    Object.assign(this, {
      ...(name !== undefined && { centerName: name }),
      ...(therapistTimeoutMinutes !== undefined && { therapistTimeoutMinutes }),
      ...(registrationCodeMinutes !== undefined && { registrationCodeMinutes }),
    });
  }

  setPin(centerPin: CenterPinHash) {
    Object.assign(this, { centerPin });
  }

  setLogo(logoPath: string | null) {
    Object.assign(this, { logoPath });
  }
}
