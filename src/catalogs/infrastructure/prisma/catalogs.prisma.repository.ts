import { Injectable } from '@nestjs/common';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { CatalogItem, CatalogKind } from '../../domain/entities/catalog-item.entity';
import { CatalogsRepository } from '../../domain/ports/catalogs.repository';
import { CatalogsPrismaMapper as M } from './catalogs.prisma.mapper';

// The three tables have the same shape (id, name, active); each one's Prisma delegate is used.
type Delegate = {
  findMany(args: object): Promise<{ id: string; name: string; active: boolean; imagePath?: string }[]>;
  count(args: object): Promise<number>;
  findUnique(args: object): Promise<{ id: string; name: string; active: boolean; imagePath?: string } | null>;
  findFirst(args: object): Promise<{ id: string; name: string; active: boolean; imagePath?: string } | null>;
  upsert(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
};

@Injectable()
export class CatalogsPrismaRepository extends CatalogsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private table(kind: CatalogKind) {
    return { avatars: this.prisma.avatar, diagnoses: this.prisma.diagnosis, conditions: this.prisma.condition }[
      kind
    ] as unknown as Delegate;
  }

  async list(kind: CatalogKind, page: PageRequest, onlyActive: boolean) {
    const where = onlyActive ? { active: true } : {};
    const [rows, total] = await Promise.all([
      this.table(kind).findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: skipOf(page), take: page.limit }),
      this.table(kind).count({ where }),
    ]);
    return toPage(
      rows.map((row) => M.toDomain(row)),
      total,
      page,
    );
  }

  async find(kind: CatalogKind, id: string) {
    const row = await this.table(kind).findUnique({ where: { id } });
    return row ? M.toDomain(row) : null;
  }

  async findByName(kind: CatalogKind, name: string) {
    const row = await this.table(kind).findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    return row ? M.toDomain(row) : null;
  }

  async findMany(kind: CatalogKind, ids: string[]) {
    return (await this.table(kind).findMany({ where: { id: { in: ids } } })).map((row) => M.toDomain(row));
  }

  async save(kind: CatalogKind, item: CatalogItem) {
    const data = M.toPrisma(item);
    await this.table(kind).upsert({ where: { id: data.id }, create: data, update: data });
  }

  async isInUse(kind: CatalogKind, id: string) {
    const uses = {
      avatars: () => this.prisma.patient.count({ where: { avatarId: id } }),
      diagnoses: () => this.prisma.patient.count({ where: { diagnosisId: id } }),
      conditions: () => this.prisma.patientCondition.count({ where: { conditionId: id } }),
    };
    return (await uses[kind]()) > 0;
  }

  async delete(kind: CatalogKind, id: string) {
    await this.table(kind).delete({ where: { id } });
  }
}
