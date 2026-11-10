import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { Homework } from '../../domain/entities/homework.entity';
import { HomeworkRepository, HomeworkRow, HomeworkStatus } from '../../domain/ports/homework.repository';

const include = {
  author: { select: { id: true, name: true } },
  pictograms: { orderBy: { sortOrder: 'asc' }, select: { pictogram: { select: { id: true, label: true, imagePath: true } } } },
} as const;

type Raw = Prisma.HomeworkGetPayload<{ include: typeof include }>;
type Practice = { id: string; sessions: number; lastAt: Date | null; correct: number; total: number };

const statusWhere = (status?: HomeworkStatus) =>
  status === 'pending' ? { completedAt: null } : status === 'done' ? { completedAt: { not: null } } : {};

@Injectable()
export class HomeworkPrismaRepository extends HomeworkRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Pictograms, who marked it done and what was practiced at home (HOME sessions with that homework), in two queries per page.
  private async rows(raws: Raw[]): Promise<HomeworkRow[]> {
    if (raws.length === 0) return [];
    const ids = raws.map((h) => h.id);
    const completers = [...new Set(raws.flatMap((h) => (h.completedBy ? [h.completedBy] : [])))];
    const [practice, users] = await Promise.all([
      this.prisma.$queryRaw<Practice[]>`
        SELECT s."homeworkId" AS id, count(DISTINCT s.id)::int AS sessions, max(s."startedAt") AS "lastAt",
               count(r.id) FILTER (WHERE r.correct AND r."firstAttempt")::int AS correct,
               count(r.id) FILTER (WHERE r."firstAttempt")::int AS total
        FROM "Session" s
        LEFT JOIN "ActivityRun" a ON a."sessionId" = s.id
        LEFT JOIN "ActivityResult" r ON r."runId" = a.id
        WHERE s."homeworkId" IN (${Prisma.join(ids)})
        GROUP BY s."homeworkId"`,
      this.prisma.user.findMany({ where: { id: { in: completers } }, select: { id: true, name: true } }),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return raws.map((h) => {
      const done = practice.find((p) => p.id === h.id);
      const { id, patientId, instructions, dueDate, withActivity, createdAt, completedAt, author } = h;
      return {
        ...{ id, patientId, instructions, dueDate, withActivity, createdAt, completedAt, author },
        completedBy: h.completedBy ? { name: names.get(h.completedBy) ?? '' } : null,
        pictograms: h.pictograms.map(({ pictogram }) => ({
          pictogramId: pictogram.id,
          label: pictogram.label,
          imagePath: pictogram.imagePath,
        })),
        practice: { sessions: done?.sessions ?? 0, lastAt: done?.lastAt ?? null, correct: done?.correct ?? 0, total: done?.total ?? 0 },
      };
    });
  }

  async list(patientId: string, status: HomeworkStatus | undefined, page: PageRequest) {
    const where = { patientId, ...statusWhere(status) };
    const [raws, total] = await Promise.all([
      this.prisma.homework.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.homework.count({ where }),
    ]);
    return toPage(await this.rows(raws), total, page);
  }

  async row(id: string) {
    const raw = await this.prisma.homework.findUnique({ where: { id }, include });
    return raw ? ((await this.rows([raw]))[0] ?? null) : null;
  }

  async find(id: string) {
    const raw = await this.prisma.homework.findUnique({ where: { id }, include: { pictograms: { orderBy: { sortOrder: 'asc' } } } });
    if (!raw) return null;
    const { patientId, authorId, instructions, dueDate, withActivity, completedAt, completedBy, createdAt, pictograms } = raw;
    const props = { id, patientId, authorId, instructions, dueDate, withActivity, completedAt, completedBy, createdAt };
    return Homework.reconstitute({ ...props, pictogramIds: pictograms.map((p) => p.pictogramId) });
  }

  async save({
    id,
    patientId,
    authorId,
    instructions,
    dueDate,
    withActivity,
    pictogramIds,
    completedAt,
    completedBy,
    createdAt,
  }: Homework) {
    const pictograms = pictogramIds.map((pictogramId, sortOrder) => ({ pictogramId, sortOrder }));
    await this.prisma.$transaction([
      this.prisma.homework.upsert({
        where: { id },
        create: { id, patientId, authorId, instructions, dueDate, withActivity, completedAt, completedBy, createdAt },
        update: { instructions, dueDate, withActivity, completedAt, completedBy },
      }),
      this.prisma.homeworkPictogram.deleteMany({ where: { homeworkId: id } }),
      this.prisma.homeworkPictogram.createMany({ data: pictograms.map((p) => ({ ...p, homeworkId: id })) }),
    ]);
  }

  async delete(id: string) {
    await this.prisma.homework.delete({ where: { id } });
  }

  async boardPictogramIds(patientId: string, ids: string[]) {
    const rows = await this.prisma.profilePictogram.findMany({
      where: { profile: { patientId }, pictogramId: { in: ids } },
      select: { pictogramId: true },
      distinct: ['pictogramId'],
    });
    return rows.map((r) => r.pictogramId);
  }

  async patientCode(patientId: string) {
    return (await this.prisma.patient.findUnique({ where: { id: patientId }, select: { code: true } }))?.code;
  }
}
