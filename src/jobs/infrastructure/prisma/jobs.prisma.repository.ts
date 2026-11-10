import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { activeStatuses, Job, JobParams, JobType } from '../../domain/entities/job.entity';
import { JobsRepository, NewJob } from '../../domain/ports/jobs.repository';

type Row = Omit<Job, 'params'> & { params: Prisma.JsonValue };
const toJob = (row: Row): Job => ({ ...row, params: (row.params ?? {}) as JobParams });
const samePeriod = (a: JobParams, b: JobParams) => (a.from ?? null) === (b.from ?? null) && (a.to ?? null) === (b.to ?? null);

@Injectable()
export class JobsPrismaRepository extends JobsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async patientCode(patientId: string) {
    return (await this.prisma.patient.findUnique({ where: { id: patientId }, select: { code: true } }))?.code ?? null;
  }

  async findActive({ type, requestedBy, patientId, params }: Omit<NewJob, 'patientCode'>) {
    const rows = await this.prisma.job.findMany({ where: { type, requestedBy, patientId, status: { in: activeStatuses } } });
    const same = rows.map(toJob).find((job) => samePeriod(job.params, params));
    return same ?? null;
  }

  async create(job: NewJob) {
    // runAfter with the API clock (the same one the worker uses when searching), not the database's.
    return toJob(await this.prisma.job.create({ data: { ...job, params: job.params, runAfter: new Date() } }));
  }

  async find(id: string) {
    const row = await this.prisma.job.findUnique({ where: { id } });
    return row && toJob(row);
  }

  async listByRequester(userId: string, page: PageRequest) {
    const where = { requestedBy: userId };
    const [rows, total] = await Promise.all([
      this.prisma.job.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: skipOf(page), take: page.limit }),
      this.prisma.job.count({ where }),
    ]);
    return toPage(rows.map(toJob), total, page);
  }

  ahead(job: Job, types: JobType[]) {
    if (job.status !== 'QUEUED') return Promise.resolve(0);
    return this.prisma.job.count({
      where: { type: { in: types }, OR: [{ status: 'RUNNING' }, { status: 'QUEUED', createdAt: { lt: job.createdAt } }] },
    });
  }

  async cancel(id: string, now: Date) {
    const { count } = await this.prisma.job.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'CANCELED', finishedAt: now } });
    return count === 1;
  }

  // The updates use updateMany: if the job was deleted (patient removed, spec 110) no error is thrown.
  // A single statement: picks the oldest available and reserves it. SKIP LOCKED prevents two workers from taking the same one;
  // it also takes over a RUNNING one whose lease expired (the worker holding it crashed).
  async claimNext(types: JobType[], now: Date, lockedUntil: Date) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      UPDATE "Job" SET "status" = 'RUNNING', "attempts" = "attempts" + 1, "startedAt" = ${now}, "lockedUntil" = ${lockedUntil}
      WHERE "id" = (
        SELECT "id" FROM "Job"
        WHERE "type"::text = ANY(${types})
          AND (("status" = 'QUEUED' AND "runAfter" <= ${now}) OR ("status" = 'RUNNING' AND "lockedUntil" < ${now}))
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *`;
    return rows[0] ? toJob(rows[0]) : null;
  }

  async renew(id: string, lockedUntil: Date) {
    await this.prisma.job.updateMany({ where: { id, status: 'RUNNING' }, data: { lockedUntil } });
  }

  async complete(id: string, result: { resultPath: string | null; fileName: string | null; finishedAt: Date; expiresAt: Date | null }) {
    const { count } = await this.prisma.job.updateMany({
      where: { id },
      data: { ...result, status: 'DONE', error: null, lockedUntil: null },
    });
    return count === 1;
  }

  async retry(id: string, error: string, runAfter: Date) {
    await this.prisma.job.updateMany({ where: { id }, data: { status: 'QUEUED', error, runAfter, lockedUntil: null } });
  }

  async fail(id: string, error: string, finishedAt: Date) {
    await this.prisma.job.updateMany({ where: { id }, data: { status: 'FAILED', error, finishedAt, lockedUntil: null } });
  }

  async purgeExpiredCredentials(before: Date) {
    await Promise.all([
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: before } } }),
      this.prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: before } } }),
      this.prisma.loginAttempt.deleteMany({
        where: { windowStartsAt: { lt: before }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: before } }] },
      }),
    ]);
  }

  async expiredResults(now: Date, limit: number) {
    const rows = await this.prisma.job.findMany({ where: { resultPath: { not: null }, expiresAt: { lt: now } }, take: limit });
    return rows.map(toJob);
  }

  async clearResult(id: string) {
    await this.prisma.job.updateMany({ where: { id }, data: { resultPath: null } });
  }

  async requesterActive(userId: string) {
    return !!(await this.prisma.user.findFirst({ where: { id: userId, active: true }, select: { id: true } }));
  }
}
