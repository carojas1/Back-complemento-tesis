import { LimitReached } from '../exceptions/limits.exceptions';

// Limits of the center of the request and its usage. The super admin sets them; null = no limit.
export interface QuotaUsage {
  maxTherapists: number | null;
  maxDevices: number | null;
  activeTherapists: number; // active THERAPIST users (parents do not count)
  activeDevices: number; // tablets not revoked
}

// Before creating a specialist (users) or a tablet registration code (devices).
export function assertQuota(usage: QuotaUsage, resource: 'therapists' | 'devices') {
  const [limit, used] = resource === 'therapists' ? [usage.maxTherapists, usage.activeTherapists] : [usage.maxDevices, usage.activeDevices];
  if (limit !== null && used >= limit) throw new LimitReached(resource, limit);
}
