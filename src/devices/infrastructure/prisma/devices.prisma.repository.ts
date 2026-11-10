import { InstitutionSuspended } from '../../domain/exceptions/devices.exceptions';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { asSystem } from '../../../tenancy/tenancy';
import { Device } from '../../domain/entities/device.entity';
import { RegistrationCode } from '../../domain/entities/registration-code.entity';
import { DevicesRepository } from '../../domain/ports/devices.repository';
import { DevicesPrismaMapper as M } from './devices.prisma.mapper';

// Token's tablet, cached for 60 s (spec 114 FR-002); saveDevice (revoke, last connection) clears it.
export const deviceKey = (tokenHash: string) => `device:${tokenHash}`;
const date = (value: Date | null) => value && new Date(value); // in Redis the row goes through JSON: dates come back as text

@Injectable()
export class DevicesPrismaRepository extends DevicesRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super();
  }

  async saveCode(code: RegistrationCode) {
    await this.prisma.deviceRegistrationCode.create({ data: M.codeToPrisma(code) });
  }

  // All institutions: the code says which one the tablet belongs to (spec 113 FR-009).
  async findCodeByHash(codeHash: string) {
    const raw = await asSystem(() => this.prisma.deviceRegistrationCode.findUnique({ where: { codeHash } }));
    return raw ? M.codeToDomain(raw) : null;
  }

  registerDevice(code: RegistrationCode, device: Device) {
    return this.prisma.$transaction(async (tx) => {
      // Condition in the UPDATE: if two tablets use the same code at once, only one wins.
      const { count } = await tx.deviceRegistrationCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: code.usedAt } });
      if (count === 0) return false;
      await tx.device.create({ data: M.deviceToPrisma(device) });
      return true;
    });
  }

  // Without lastSyncAt: only the sync writes it and the cached tablet may carry a stale one.
  async saveDevice(device: Device) {
    const { lastSyncAt: _, ...data } = M.deviceToPrisma(device);
    await this.prisma.device.update({ where: { id: device.id }, data });
    await this.cache.del(deviceKey(device.tokenHash));
  }

  async saveLastSeen(device: Device) {
    await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: device.lastSeenAt } });
    await this.cache.del(deviceKey(device.tokenHash));
  }

  async findDeviceById(id: string) {
    const raw = await this.prisma.device.findUnique({ where: { id } });
    return raw ? M.deviceToDomain(raw) : null;
  }

  // All institutions: the request's institution comes from the tablet. With the institution suspended, the tablet is
  // known but does not get in (once the cache expires).
  async findDeviceByTokenHash(tokenHash: string) {
    const find = () =>
      asSystem(async () => {
        const row = await this.prisma.device.findFirst({ where: { tokenHash }, include: { institution: { select: { active: true } } } });
        if (!row) return null;
        const { institution, ...device } = row;
        return { ...device, institutionActive: institution.active };
      });
    const cached = await this.cache.wrap(deviceKey(tokenHash), find);
    if (!cached) return null;
    if (cached.institutionActive === false) throw new InstitutionSuspended();
    const { institutionActive: _, ...raw } = cached;
    const { registeredAt, lastSeenAt, lastSyncAt, revokedAt } = raw;
    return M.deviceToDomain({
      ...raw,
      registeredAt: new Date(registeredAt),
      lastSeenAt: date(lastSeenAt),
      lastSyncAt: date(lastSyncAt),
      revokedAt: date(revokedAt),
    });
  }

  async list(page: PageRequest) {
    const [rows, total] = await Promise.all([
      this.prisma.device.findMany({
        include: { registrationCode: { select: { creator: { select: { name: true } } } } },
        orderBy: [{ registeredAt: 'desc' }, { id: 'asc' }],
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.device.count(),
    ]);
    const items = rows.map((raw) => ({ device: M.deviceToDomain(raw), authorizedBy: raw.registrationCode?.creator.name ?? null }));
    return toPage(items, total, page);
  }
}
