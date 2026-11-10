import { Injectable } from '@nestjs/common';
import type * as db from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { DataRequest, DataRequestType } from '../../domain/entities/data-request.entity';
import { DataRequestFilter, DataRequestsRepository } from '../../domain/ports/data-requests.repository';

const toEntity = (row: db.DataRequest) => DataRequest.reconstitute(row);

@Injectable()
export class DataRequestsPrismaRepository extends DataRequestsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save({ id, patientCode, type, requestedAt, respondedAt, status, handledBy, notes, statisticalUseAllowed }: DataRequest) {
    const data = { patientCode, type, requestedAt, respondedAt, status, handledBy, notes, statisticalUseAllowed };
    await this.prisma.dataRequest.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  async find(id: string) {
    const row = await this.prisma.dataRequest.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findOpen(patientCode: string, type: DataRequestType) {
    return (await this.prisma.dataRequest.findMany({ where: { patientCode, type, status: 'OPEN' } })).map(toEntity);
  }

  // The request stores the code (not an FK): the therapist sees those for the codes of their assigned patients.
  async list({ status, type, therapistId }: DataRequestFilter, page: PageRequest) {
    const codes = therapistId
      ? (await this.prisma.therapistPatient.findMany({ where: { therapistId }, select: { patient: { select: { code: true } } } })).map(
          (a) => a.patient.code,
        )
      : undefined;
    const where: Prisma.DataRequestWhereInput = { status, type, patientCode: codes ? { in: codes } : undefined };
    const [rows, total] = await Promise.all([
      this.prisma.dataRequest.findMany({ where, orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }], skip: skipOf(page), take: page.limit }),
      this.prisma.dataRequest.count({ where }),
    ]);
    const [patients, users] = await Promise.all([
      this.prisma.patient.findMany({ where: { code: { in: rows.map((r) => r.patientCode) } }, select: { id: true, code: true } }),
      this.prisma.user.findMany({
        where: { id: { in: rows.flatMap((r) => (r.handledBy ? [r.handledBy] : [])) } },
        select: { id: true, name: true },
      }),
    ]);
    const patientIds = new Map(patients.map((p) => [p.code, p.id]));
    const names = new Map(users.map((u) => [u.id, u.name]));
    return toPage(
      rows.map((row) => ({
        request: toEntity(row),
        patientId: patientIds.get(row.patientCode) ?? null,
        handledByName: row.handledBy ? (names.get(row.handledBy) ?? null) : null,
      })),
      total,
      page,
    );
  }
}
