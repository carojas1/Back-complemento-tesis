import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type * as db from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { currentInstitution } from '../../../tenancy/tenancy';
import { CenterPinHash, CenterSettings } from '../../domain/entities/center-settings.entity';
import { SettingsRepository } from '../../domain/ports/settings.repository';

const toDomain = ({ centerName, centerPin, therapistTimeoutMinutes, registrationCodeMinutes, logoPath, updatedAt }: db.CenterSettings) =>
  CenterSettings.reconstitute({
    centerName,
    centerPin: (centerPin as CenterPinHash | null) ?? null,
    therapistTimeoutMinutes,
    registrationCodeMinutes,
    logoPath,
    updatedAt: new Date(updatedAt), // from the Redis cache it comes back as text
  });

// Settings of each institution, cached for 60 s (spec 114 FR-002); save() clears it.
const settingsKey = (institutionId: string) => `inst:${institutionId}:settings`;

// One row per institution (spec 113). If it is missing, it is created with the default values.
@Injectable()
export class SettingsPrismaRepository extends SettingsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super();
  }

  async get() {
    const institutionId = currentInstitution();
    const upsert = () => this.prisma.centerSettings.upsert({ where: { institutionId }, create: { institutionId }, update: {} });
    return toDomain(await this.cache.wrap(settingsKey(institutionId), upsert));
  }

  async save({ centerName, centerPin, therapistTimeoutMinutes, registrationCodeMinutes, logoPath }: CenterSettings) {
    const data = {
      centerName,
      centerPin: centerPin ? { ...centerPin } : Prisma.DbNull,
      therapistTimeoutMinutes,
      registrationCodeMinutes,
      logoPath,
    };
    const institutionId = currentInstitution();
    const raw = await this.prisma.centerSettings.upsert({ where: { institutionId }, create: { institutionId, ...data }, update: data });
    await this.cache.del(settingsKey(institutionId));
    return toDomain(raw);
  }
}
