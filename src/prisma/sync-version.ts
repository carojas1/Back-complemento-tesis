import { Prisma } from '@prisma/client';
import { currentInstitution } from '../tenancy/tenancy';

// The next sync version of the center. Whatever is stamped with it reaches the tablets on their next GET /sync/profiles.
export async function nextSyncVersion(tx: Prisma.TransactionClient) {
  const { value } = await tx.globalSyncVersion.upsert({
    where: { institutionId: currentInstitution() },
    create: { institutionId: currentInstitution(), value: 1 },
    update: { value: { increment: 1 } },
  });
  return value;
}
