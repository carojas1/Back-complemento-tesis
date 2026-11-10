import { QuotaUsage } from '../entities/quota.entity';

// Limits of the center of the request, read under RLS. Used by users (new specialist) and devices (new code).
export abstract class QuotaReader {
  abstract usage(): Promise<QuotaUsage>;
}
