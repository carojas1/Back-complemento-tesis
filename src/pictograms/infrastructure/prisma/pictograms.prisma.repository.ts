import { Injectable } from '@nestjs/common';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { Pictogram } from '../../domain/entities/pictogram.entity';
import { PictogramsRepository } from '../../domain/ports/pictograms.repository';
import { PictogramsPrismaMapper as M } from './pictograms.prisma.mapper';
import { nextSyncVersion } from '../../../prisma/sync-version';

@Injectable()
export class PictogramsPrismaRepository extends PictogramsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findPictogram(id: string) {
    const row = await this.prisma.pictogram.findUnique({ where: { id } });
    return row ? M.toDomain(row) : null;
  }

  async findPictograms(ids: string[]) {
    const rows = await this.prisma.pictogram.findMany({ where: { id: { in: ids } } });
    return rows.map((row) => M.toDomain(row));
  }

  async findPictogramByArasaacId(arasaacId: number) {
    const row = await this.prisma.pictogram.findFirst({ where: { arasaacId } });
    return row ? M.toDomain(row) : null;
  }

  async findPictogramsByArasaacIds(arasaacIds: number[]) {
    const rows = await this.prisma.pictogram.findMany({ where: { arasaacId: { in: arasaacIds } } });
    return rows.map((row) => M.toDomain(row));
  }

  async searchPictograms(query: string | undefined, page: PageRequest) {
    const where = query ? { label: { contains: query, mode: 'insensitive' as const } } : {};
    const [rows, total] = await Promise.all([
      this.prisma.pictogram.findMany({ where, orderBy: [{ label: 'asc' }, { id: 'asc' }], skip: skipOf(page), take: page.limit }),
      this.prisma.pictogram.count({ where }),
    ]);
    return toPage(
      rows.map((row) => M.toDomain(row)),
      total,
      page,
    );
  }

  async savePictogram(pictogram: Pictogram) {
    const data = M.toPrisma(pictogram);
    await this.prisma.pictogram.upsert({ where: { id: data.id }, create: data, update: data });
  }

  // Same global version as the rest of the sync (profiles.prisma.repository): the tablets download the profiles
  // with a version higher than theirs.
  async touchBoards(pictogramId: string) {
    await this.prisma.$transaction(async (tx) => {
      const value = await nextSyncVersion(tx);
      await tx.profile.updateMany({ where: { pictograms: { some: { pictogramId } } }, data: { syncVersion: value } });
    });
  }
}
