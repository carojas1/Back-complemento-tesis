import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { currentInstitution } from '../../../tenancy/tenancy';
import { QuotaReader } from '../../domain/ports/quota.reader';

// Runs under RLS: only the center of the request is visible.
@Injectable()
export class QuotaPrismaReader extends QuotaReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async usage() {
    const [institution, activeTherapists, activeDevices] = await Promise.all([
      this.prisma.institution.findUnique({ where: { id: currentInstitution() }, select: { maxTherapists: true, maxDevices: true } }),
      this.prisma.user.count({ where: { role: 'THERAPIST', active: true } }),
      this.prisma.device.count({ where: { revokedAt: null } }),
    ]);
    return {
      maxTherapists: institution?.maxTherapists ?? null,
      maxDevices: institution?.maxDevices ?? null,
      activeTherapists,
      activeDevices,
    };
  }
}
