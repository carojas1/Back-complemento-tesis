export interface DeviceProps {
  id: string;
  institutionId: string; // that of the code it registered with, for good (spec 113 FR-009)
  name: string;
  model: string | null;
  appVersion: string | null;
  tokenHash: string;
  publicKey: string; // ECDSA P-256 (SPKI base64) of the tablet's Keystore
  registrationCodeId: string | null;
  registeredAt: Date;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  revokedAt: Date | null;
}

const minute = 60_000;

// Center tablet (spec 103). A revoked one is not deleted: it keeps its sessions (FR-003).
export interface Device extends Readonly<DeviceProps> {}
export class Device {
  private constructor(props: DeviceProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: DeviceProps) {
    return new Device(props);
  }

  static register(
    input: Pick<DeviceProps, 'institutionId' | 'name' | 'model' | 'appVersion' | 'tokenHash' | 'publicKey' | 'registrationCodeId'>,
  ) {
    return new Device({
      ...input,
      id: crypto.randomUUID(),
      name: input.name.trim(),
      registeredAt: new Date(),
      lastSeenAt: null,
      lastSyncAt: null,
      revokedAt: null,
    });
  }

  isRevoked() {
    return this.revokedAt !== null;
  }

  revoke(now: Date) {
    if (!this.isRevoked()) Object.assign(this, { revokedAt: now });
  }

  // More than 7 days without syncing (or never synced since registration): highlighted on the web.
  isStale(now: Date) {
    const lastContact = this.lastSyncAt ?? this.registeredAt;
    return now.getTime() - lastContact.getTime() > 7 * 24 * 60 * minute;
  }

  // Stores the last connection at most once a minute, to avoid writing on every request.
  touch(now: Date) {
    if (this.lastSeenAt && now.getTime() - this.lastSeenAt.getTime() < minute) return false;
    Object.assign(this, { lastSeenAt: now });
    return true;
  }

  toSnapshot(): DeviceProps {
    return { ...this };
  }
}
