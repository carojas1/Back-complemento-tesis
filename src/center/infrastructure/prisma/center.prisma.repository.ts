import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { CenterHoursEntry } from '../../domain/entities/center.entity';
import { CenterRepository } from '../../domain/ports/center.repository';

const room = { id: true, name: true, active: true } as const;
const isTaken = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
const isMissing = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

@Injectable()
export class CenterPrismaRepository extends CenterRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listRooms(onlyActive: boolean, page: PageRequest) {
    const where = onlyActive ? { active: true } : {};
    const [rows, total] = await Promise.all([
      this.prisma.room.findMany({ where, select: room, orderBy: [{ name: 'asc' }], skip: skipOf(page), take: page.limit }),
      this.prisma.room.count({ where }),
    ]);
    return toPage(rows, total, page);
  }

  async createRoom(name: string) {
    try {
      return await this.prisma.room.create({ data: { name }, select: room });
    } catch (error) {
      if (isTaken(error)) return null;
      throw error;
    }
  }

  async updateRoom(id: string, changes: { name?: string; active?: boolean }) {
    try {
      return await this.prisma.room.update({ where: { id }, data: changes, select: room });
    } catch (error) {
      if (isTaken(error)) return null;
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  getHours() {
    return this.prisma.centerHours.findMany({ select: { weekday: true, opensAt: true, closesAt: true }, orderBy: { weekday: 'asc' } });
  }

  async replaceHours(hours: CenterHoursEntry[]) {
    await this.prisma.$transaction([this.prisma.centerHours.deleteMany(), this.prisma.centerHours.createMany({ data: hours })]);
  }
}
