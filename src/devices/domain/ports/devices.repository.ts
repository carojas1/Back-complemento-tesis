import { Page, PageRequest } from '../../../common/pagination/page';
import { Device } from '../entities/device.entity';
import { RegistrationCode } from '../entities/registration-code.entity';

export interface DeviceListItem {
  device: Device;
  authorizedBy: string | null; // name of the admin who generated the code
}

export abstract class DevicesRepository {
  abstract saveCode(code: RegistrationCode): Promise<void>;
  abstract findCodeByHash(codeHash: string): Promise<RegistrationCode | null>;
  // In a transaction: marks the code as used (only if it was not already) and creates the tablet.
  // Returns false if another tablet used the code first.
  abstract registerDevice(code: RegistrationCode, device: Device): Promise<boolean>;
  abstract saveDevice(device: Device): Promise<void>;
  // Only when it was last seen: a request in flight must not write back a row read before a revocation.
  abstract saveLastSeen(device: Device): Promise<void>;
  abstract findDeviceById(id: string): Promise<Device | null>;
  abstract findDeviceByTokenHash(tokenHash: string): Promise<Device | null>;
  abstract list(page: PageRequest): Promise<Page<DeviceListItem>>;
}

// Verifies the tablet's signatures (spec 103 FR-005).
export abstract class SignatureVerifier {
  abstract isValidPublicKey(publicKey: string): boolean;
  abstract verify(publicKey: string, message: string, signature: string): boolean;
}
