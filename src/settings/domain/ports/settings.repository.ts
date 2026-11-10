import { CenterPinHash, CenterSettings } from '../entities/center-settings.entity';

export abstract class SettingsRepository {
  abstract get(): Promise<CenterSettings>;
  abstract save(settings: CenterSettings): Promise<CenterSettings>;
}

// Hashes and checks the Center PIN the same way as the tablet (spec 002 FR-002): so the tablet verifies it offline.
export abstract class CenterPinHasher {
  abstract hash(pin: string): CenterPinHash;
  abstract verify(pin: string, stored: CenterPinHash): boolean;
}
