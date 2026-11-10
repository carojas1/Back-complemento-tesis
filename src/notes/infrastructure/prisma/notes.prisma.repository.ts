import { Injectable } from '@nestjs/common';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { GoalStatus, Note } from '../../domain/entities/note.entity';
import { NotesRepository } from '../../domain/ports/notes.repository';

@Injectable()
export class NotesPrismaRepository extends NotesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listNotes(patientId: string, { from, to }: { from?: Date; to?: Date }, page: PageRequest) {
    const where = { patientId, createdAt: from || to ? { gte: from, lte: to } : undefined };
    const [rows, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        include: { author: { select: { name: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.note.count({ where }),
    ]);
    // Chronological order (spec 108 criterion).
    const items = rows.map(({ author, ...row }) => Object.assign(Note.reconstitute(row), { authorName: author.name }));
    return toPage(items, total, page);
  }

  async findNote(id: string) {
    const row = await this.prisma.note.findUnique({ where: { id } });
    return row ? Note.reconstitute(row) : null;
  }

  async saveNote({ id, patientId, sessionId, authorId, text, sharedWithFamily, createdAt, editedAt }: Note) {
    await this.prisma.note.upsert({
      where: { id },
      create: { id, patientId, sessionId, authorId, text, sharedWithFamily, createdAt },
      update: { text, sharedWithFamily, editedAt },
    });
  }

  async sessionOfPatient(sessionId: string, patientId: string) {
    return (await this.prisma.session.count({ where: { id: sessionId, patientId } })) > 0;
  }

  async listGoals(patientId: string, page: PageRequest) {
    const where = { patientId };
    const [rows, total] = await Promise.all([
      this.prisma.goal.findMany({
        where,
        include: { author: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.goal.count({ where }),
    ]);
    return toPage(
      rows.map(({ id, patientId, text, targetDate, status, createdAt, updatedAt, author }) => ({
        id,
        patientId,
        text,
        targetDate,
        status,
        createdAt,
        updatedAt,
        authorName: author.name,
      })),
      total,
      page,
    );
  }

  findGoal(id: string) {
    return this.prisma.goal.findUnique({ where: { id }, select: { id: true, patientId: true } });
  }

  async createGoal(goal: { patientId: string; authorId: string; text: string; targetDate: Date | null }) {
    return (await this.prisma.goal.create({ data: goal, select: { id: true } })).id;
  }

  async updateGoal(id: string, { status, text, targetDate }: { status?: GoalStatus; text?: string; targetDate?: Date | null }) {
    await this.prisma.goal.update({ where: { id }, data: { status, text, targetDate } });
  }

  async patientCode(patientId: string) {
    return (await this.prisma.patient.findUnique({ where: { id: patientId }, select: { code: true } }))?.code;
  }
}
