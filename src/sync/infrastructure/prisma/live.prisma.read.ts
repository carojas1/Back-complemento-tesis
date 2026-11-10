import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { LivePatient, LiveSession } from '../../domain/live';
import { LiveRead } from '../../domain/ports/sync.repository';

type OpenRow = LiveSession & { patientId: string };
const twoHours = 2 * 60 * 60_000; // the tablet closes a session on its own after 2 h without activity (spec 004)

// Live panel reads (spec 106 FR-005/006).
@Injectable()
export class LivePrismaRead extends LiveRead {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Most recent open session of each patient (no end and with activity in the last 2 h).
  private async openSessions(where: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<OpenRow[]>`
      SELECT DISTINCT ON (s."patientId") s.id, s."patientId", s."startedAt", s."deviceId", d.name AS "deviceName", u.name AS "therapistName",
             (SELECT max(e."occurredAt") FROM "Event" e WHERE e."sessionId" = s.id) AS "lastEventAt"
      FROM "Session" s JOIN "Device" d ON d.id = s."deviceId" LEFT JOIN "User" u ON u.id = s."therapistId"
      WHERE s."endedAt" IS NULL AND ${where}
      ORDER BY s."patientId", s."startedAt" DESC`;
    const since = Date.now() - twoHours;
    return new Map(rows.filter((r) => (r.lastEventAt ?? r.startedAt).getTime() > since).map(({ patientId, ...s }) => [patientId, s]));
  }

  private async withSessions(patients: { id: string; code: string; avatar: { imagePath: string } }[]): Promise<LivePatient[]> {
    const ids = patients.map((p) => p.id);
    const open = ids.length ? await this.openSessions(Prisma.sql`s."patientId" IN (${Prisma.join(ids)})`) : new Map<string, LiveSession>();
    return patients.map((p) => ({ patientId: p.id, code: p.code, avatarPath: p.avatar.imagePath, session: open.get(p.id) ?? null }));
  }

  async patients({ therapistId }: { therapistId?: string }, page: PageRequest) {
    const where: Prisma.PatientWhereInput = { status: 'ACTIVE', ...(therapistId ? { therapists: { some: { therapistId } } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        select: { id: true, code: true, avatar: { select: { imagePath: true } } },
        orderBy: { code: 'asc' },
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.patient.count({ where }),
    ]);
    return toPage(await this.withSessions(rows), total, page);
  }

  async byIds(patientIds: string[]) {
    if (patientIds.length === 0) return [];
    return this.withSessions(
      await this.prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, code: true, avatar: { select: { imagePath: true } } },
      }),
    );
  }

  async openOnDevice(deviceId: string) {
    return [...(await this.openSessions(Prisma.sql`s."deviceId" = ${deviceId}`)).keys()];
  }

  async sessionLog(sessionId: string) {
    const [events, results] = await Promise.all([
      this.prisma.event.findMany({
        where: { sessionId },
        orderBy: { occurredAt: 'asc' },
        select: { id: true, type: true, payload: true, occurredAt: true },
      }),
      this.prisma.activityResult.findMany({ where: { run: { sessionId } }, orderBy: { answeredAt: 'asc' } }),
    ]);
    return { events, results };
  }

  async assignedTherapists(patientId: string) {
    return (await this.prisma.therapistPatient.findMany({ where: { patientId }, select: { therapistId: true } })).map((t) => t.therapistId);
  }
}
