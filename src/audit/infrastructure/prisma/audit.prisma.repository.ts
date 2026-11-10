import { Injectable } from '@nestjs/common';
import type * as db from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditFilters, AuditRecord, AuditRepository } from '../../domain/ports/audit.repository';

// An edited note keeps its previous text in the log (spec 105 FR-001). Whoever reads this log is an administrator, and they never see clinical content (spec 102).
function withoutClinicalText(action: string, summary: db.AuditLog['summary']) {
  if (action !== 'NOTE_UPDATE' || typeof summary !== 'object' || summary === null || Array.isArray(summary)) return summary;
  const { previous: _previous, ...rest } = summary;
  return rest;
}

@Injectable()
export class AuditPrismaRepository extends AuditRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private where({ actorId, action, patientCode, from, to }: AuditFilters) {
    return { actorId, action, patientCode, createdAt: from || to ? { gte: from, lte: to } : undefined };
  }

  // User and tablet names in one query per table (the log stores only the id).
  private async withNames(rows: db.AuditLog[]): Promise<AuditRecord[]> {
    const ids = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
    const [users, devices] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      this.prisma.device.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ]);
    const names = new Map([...users, ...devices].map((x) => [x.id, x.name]));
    return rows.map(({ id, summary, ...row }) => ({
      ...row,
      id: id.toString(),
      summary: withoutClinicalText(row.action, summary),
      actorName: row.actorId ? (names.get(row.actorId) ?? null) : null,
    }));
  }

  async list(filters: AuditFilters, page: PageRequest) {
    const where = this.where(filters);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: skipOf(page), take: page.limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return toPage(await this.withNames(rows), total, page);
  }

  async find(id: bigint) {
    const row = await this.prisma.auditLog.findUnique({ where: { id } });
    return row ? (await this.withNames([row]))[0] : null;
  }

  async all(filters: AuditFilters, max: number) {
    return this.withNames(await this.prisma.auditLog.findMany({ where: this.where(filters), orderBy: { id: 'desc' }, take: max }));
  }
}
