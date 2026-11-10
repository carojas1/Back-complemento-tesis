import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PictogramsPrismaMapper } from '../../../pictograms/infrastructure/prisma/pictograms.prisma.mapper';
import { PrismaService } from '../../../prisma/prisma.service';
import { currentInstitution } from '../../../tenancy/tenancy';
import { Profile } from '../../domain/entities/profile.entity';
import { AddResult, PatientAccess, ProfileBoard, ProfilesRepository } from '../../domain/ports/profiles.repository';
import { ProfilesPrismaMapper as M } from './profiles.prisma.mapper';
import { isTherapistAssigned } from '../../../prisma/patient-access';

const board = {
  patient: {
    select: {
      code: true,
      avatar: { select: { imagePath: true } },
      voice: { select: { status: true, clips: { select: { pictogramId: true, text: true, path: true } } } },
    },
  },
  categories: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { pictograms: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { pictogram: true } } },
  },
} satisfies Prisma.ProfileInclude;

type BoardRow = Prisma.ProfileGetPayload<{ include: typeof board }>;

const toBoard = (row: BoardRow): ProfileBoard => {
  const { voice } = row.patient;
  // A cloned voice audio is valid only if it was generated with the pictogram's current label.
  const clip = (pictogramId: string, label: string) =>
    voice?.clips.find((c) => c.pictogramId === pictogramId && c.text === label)?.path ?? null;
  return {
    profile: M.toDomain(row),
    patientCode: row.patient.code,
    avatarPath: row.patient.avatar.imagePath,
    voiceStatus: (voice?.status ?? 'NONE') as ProfileBoard['voiceStatus'],
    categories: row.categories.map(({ id, name, color, sortOrder, pictograms }) => ({
      id,
      name,
      color,
      sortOrder,
      pictograms: pictograms.map((p) => ({
        id: p.id,
        pictogram: PictogramsPrismaMapper.toDomain(p.pictogram),
        sortOrder: p.sortOrder,
        hidden: p.hidden,
        usage: { useCount: p.useCount, daysUsed: p.daysUsed, lastUsedAt: p.lastUsedAt },
        recordingPath: p.recordingPath,
        clipPath: clip(p.pictogramId, p.pictogram.label),
      })),
    })),
  };
};

// The same ids, with no duplicates or missing ones.
const sameIds = (current: { id: string }[], ids: string[]) =>
  ids.length === current.length && new Set(ids).size === ids.length && current.every((c) => ids.includes(c.id));

@Injectable()
export class ProfilesPrismaRepository extends ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Global version (single row id = 1): every change bumps it and the profile stores its own (syncVersion).
  private nextVersion(tx: Prisma.TransactionClient) {
    return tx.globalSyncVersion
      .upsert({
        where: { institutionId: currentInstitution() },
        create: { institutionId: currentInstitution(), value: 1 },
        update: { value: { increment: 1 } },
      })
      .then((v) => v.value);
  }

  async createFromTemplate(patientId: string) {
    const categories = await this.prisma.category.findMany({
      where: { active: true, pictograms: { some: { pictogram: { active: true } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { pictograms: { where: { pictogram: { active: true } }, orderBy: [{ sortOrder: 'asc' }, { pictogramId: 'asc' }] } },
    });
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.create({ data: { patientId, syncVersion: await this.nextVersion(tx) } });
      for (const [order, category] of categories.entries()) {
        await tx.profileCategory.create({
          data: {
            profileId: profile.id,
            name: category.name,
            color: category.color,
            sortOrder: order,
            pictograms: {
              create: category.pictograms.map((link, i) => ({ profileId: profile.id, pictogramId: link.pictogramId, sortOrder: i })),
            },
          },
        });
      }
    });
  }

  async findByPatient(patientId: string) {
    const row = await this.prisma.profile.findUnique({ where: { patientId } });
    return row ? M.toDomain(row) : null;
  }

  async findBoard(patientId: string) {
    const row = await this.prisma.profile.findUnique({ where: { patientId }, include: board });
    return row ? toBoard(row) : null;
  }

  async saveSettings(profile: Profile) {
    const { id, gridSize, activityLevel, speechRate, sentenceBarEnabled, version, voice } = profile;
    const { activityPrompts, activityRepeatSeconds, activityTypes } = profile;
    const data = {
      gridSize,
      activityLevel,
      speechRate,
      sentenceBarEnabled,
      activityPrompts,
      activityRepeatSeconds,
      activityTypes,
      voice,
      version,
    };
    await this.prisma.$transaction(async (tx) => {
      const syncVersion = await this.nextVersion(tx);
      await tx.profile.update({ where: { id }, data: { ...data, syncVersion } });
    });
  }

  async setPictogramHidden(profile: Profile, boardPictogramId: string, hidden: boolean) {
    const { count } = await this.prisma.profilePictogram.updateMany({
      where: { id: boardPictogramId, profileId: profile.id, hidden: !hidden },
      data: { hidden },
    });
    return count > 0;
  }

  async addCategory(profileId: string, categoryId: string): Promise<AddResult> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, active: true },
      include: { pictograms: { where: { pictogram: { active: true } }, orderBy: [{ sortOrder: 'asc' }, { pictogramId: 'asc' }] } },
    });
    if (!category) return 'missing';
    if (await this.prisma.profileCategory.count({ where: { profileId, name: category.name } })) return 'duplicate';
    const last = await this.prisma.profileCategory.aggregate({ where: { profileId }, _max: { sortOrder: true } });
    const sortOrder = (last._max.sortOrder ?? -1) + 1; // at the end
    await this.prisma.profileCategory.create({
      data: {
        profileId,
        name: category.name,
        color: category.color,
        sortOrder,
        pictograms: { create: category.pictograms.map((link, i) => ({ profileId, pictogramId: link.pictogramId, sortOrder: i })) },
      },
    });
    return 'added';
  }

  async removeCategory(profileId: string, profileCategoryId: string) {
    return (await this.prisma.profileCategory.deleteMany({ where: { id: profileCategoryId, profileId } })).count > 0;
  }

  async addPictogram(profileId: string, profileCategoryId: string, pictogramId: string): Promise<AddResult> {
    const [category, pictogram] = await Promise.all([
      this.prisma.profileCategory.findFirst({ where: { id: profileCategoryId, profileId }, select: { id: true } }),
      this.prisma.pictogram.findFirst({ where: { id: pictogramId, active: true }, select: { id: true } }),
    ]);
    if (!category || !pictogram) return 'missing';
    if (await this.prisma.profilePictogram.count({ where: { categoryId: category.id, pictogramId } })) return 'duplicate';
    const last = await this.prisma.profilePictogram.aggregate({ where: { categoryId: category.id }, _max: { sortOrder: true } });
    const sortOrder = (last._max.sortOrder ?? -1) + 1; // at the end
    await this.prisma.profilePictogram.create({ data: { profileId, categoryId: category.id, pictogramId, sortOrder } });
    return 'added';
  }

  async orderCategories(profileId: string, ids: string[]) {
    const current = await this.prisma.profileCategory.findMany({ where: { profileId }, select: { id: true } });
    if (!sameIds(current, ids)) return false;
    await this.prisma.$transaction(ids.map((id, sortOrder) => this.prisma.profileCategory.update({ where: { id }, data: { sortOrder } })));
    return true;
  }

  async orderPictograms(profileId: string, categoryId: string, ids: string[]) {
    const current = await this.prisma.profilePictogram.findMany({ where: { profileId, categoryId }, select: { id: true } });
    if (current.length === 0 || !sameIds(current, ids)) return false;
    await this.prisma.$transaction(ids.map((id, sortOrder) => this.prisma.profilePictogram.update({ where: { id }, data: { sortOrder } })));
    return true;
  }

  async removePictogram(profileId: string, boardPictogramId: string) {
    const row = await this.prisma.profilePictogram.findFirst({
      where: { id: boardPictogramId, profileId },
      select: { recordingPath: true },
    });
    if (!row) return null;
    await this.prisma.profilePictogram.delete({ where: { id: boardPictogramId } });
    return row;
  }

  async setRecording(profileId: string, boardPictogramId: string, path: string | null) {
    const row = await this.prisma.profilePictogram.findFirst({
      where: { id: boardPictogramId, profileId },
      select: { recordingPath: true },
    });
    if (!row) return null;
    await this.prisma.profilePictogram.update({ where: { id: boardPictogramId }, data: { recordingPath: path } });
    return { previous: row.recordingPath };
  }

  async voiceReady(patientId: string) {
    return (await this.prisma.voice.count({ where: { patientId, status: 'READY' } })) > 0;
  }

  async touch(patientId: string) {
    await this.prisma.$transaction(async (tx) => {
      const syncVersion = await this.nextVersion(tx);
      await tx.profile.updateMany({ where: { patientId }, data: { syncVersion } });
    });
  }

  async listBoardsChangedSince(since: number, page: PageRequest, upTo: number) {
    const where = { syncVersion: { gt: since, lte: upTo }, patient: { status: 'ACTIVE' as const } };
    const [rows, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        include: board,
        orderBy: [{ syncVersion: 'asc' }, { id: 'asc' }],
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.profile.count({ where }),
    ]);
    return toPage(rows.map(toBoard), total, page);
  }

  async dischargedCodesSince(since: number) {
    const rows = await this.prisma.patient.findMany({
      where: { status: 'DISCHARGED', profile: { syncVersion: { gt: since } } },
      select: { code: true },
    });
    return rows.map((row) => row.code);
  }

  async retiredCodesSince(since: number) {
    const rows = await this.prisma.retiredPatientCode.findMany({ where: { syncVersion: { gt: since } }, select: { code: true } });
    return rows.map((row) => row.code);
  }

  async currentVersion() {
    return (await this.prisma.globalSyncVersion.findUnique({ where: { institutionId: currentInstitution() } }))?.value ?? 0;
  }
}

@Injectable()
export class PatientAccessPrisma extends PatientAccess {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  isAssigned(patientId: string, therapistId: string) {
    return isTherapistAssigned(this.prisma, patientId, therapistId);
  }
}
