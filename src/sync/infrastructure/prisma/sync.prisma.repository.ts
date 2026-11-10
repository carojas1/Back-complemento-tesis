import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BatchSource,
  SessionRow,
  SyncActivityResult,
  SyncActivityRun,
  SyncEvent,
  SyncRepository,
} from '../../domain/ports/sync.repository';
import { nextSyncVersion } from '../../../prisma/sync-version';

@Injectable()
export class SyncPrismaRepository extends SyncRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findPatients(codes: string[]) {
    return this.prisma.patient.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, status: true, dischargedAt: true },
    });
  }

  async therapistIds(ids: string[]) {
    return (await this.prisma.user.findMany({ where: { id: { in: ids }, role: 'THERAPIST' }, select: { id: true } })).map((u) => u.id);
  }

  async pinVerifiedBefore(deviceId: string, therapistId: string, startedAt: Date) {
    const since = new Date(startedAt.getTime() - 12 * 60 * 60_000); // 12 hours
    const found = await this.prisma.auditLog.count({
      where: {
        action: 'THERAPIST_PIN_OK',
        actorId: deviceId,
        entityId: therapistId,
        createdAt: { gte: since, lte: new Date(startedAt.getTime() + 60_000) },
      },
    });
    return found > 0;
  }

  async guardianPatientIds(guardianId: string) {
    return (await this.prisma.guardianPatient.findMany({ where: { guardianId }, select: { patientId: true } })).map((g) => g.patientId);
  }

  homeworkPatients(ids: string[]) {
    return this.prisma.homework.findMany({ where: { id: { in: ids } }, select: { id: true, patientId: true } });
  }

  existingSessions(ids: string[]) {
    return this.prisma.session.findMany({ where: { id: { in: ids } }, select: { id: true, patientId: true, guardianId: true } });
  }

  existingRuns(ids: string[]) {
    return this.prisma.activityRun.findMany({ where: { id: { in: ids } }, select: { id: true, sessionId: true } });
  }

  // FR-003: createMany with skipDuplicates on the tablet's UUID; resending a batch duplicates nothing.
  async save(
    batch: { sessions: SessionRow[]; events: SyncEvent[]; activityRuns: SyncActivityRun[]; activityResults: SyncActivityResult[] },
    source: BatchSource,
  ) {
    const ended = batch.sessions.filter((s) => s.endedAt);
    await this.prisma.$transaction([
      this.prisma.session.createMany({
        data: batch.sessions.map(({ endedAt, ...s }) => ({ ...s, endedAt: endedAt ?? null })),
        skipDuplicates: true,
      }),
      // A session uploaded earlier (live) arrives later with its end time.
      ...ended.map((s) => this.prisma.session.updateMany({ where: { id: s.id, endedAt: null }, data: { endedAt: s.endedAt } })),
      this.prisma.event.createMany({
        data: batch.events.map((e) => ({ ...e, payload: e.payload as Prisma.InputJsonObject })),
        skipDuplicates: true,
      }),
      this.prisma.activityRun.createMany({
        data: batch.activityRuns.map(({ endedAt, ...r }) => ({ ...r, endedAt: endedAt ?? null })),
        skipDuplicates: true,
      }),
      ...batch.activityRuns
        .filter((r) => r.endedAt)
        .map((r) => this.prisma.activityRun.updateMany({ where: { id: r.id, endedAt: null }, data: { endedAt: r.endedAt } })),
      this.prisma.activityResult.createMany({ data: batch.activityResults, skipDuplicates: true }),
      ...('deviceId' in source ? [this.prisma.device.update({ where: { id: source.deviceId }, data: { lastSyncAt: new Date() } })] : []), // FR-002
    ]);
  }

  // Recalculating (not adding) keeps the count right even if a batch arrives repeated or late.
  // Days are counted in Ecuador time (UTC-5, no daylight saving).
  // First the sessions of those patients (MATERIALIZED): so Postgres finds their events through the index
  // (sessionId, occurredAt) instead of scanning the whole Event table on every batch (72 ms → 7 ms with 377 000 events,
  // test/perf/RESULTADOS.md). ponytail: aggregates over all of the patient's events; incremental counters if a
  // patient reaches hundreds of thousands.
  async refreshUsage(patientIds: string[], pictogramIds: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        WITH s AS MATERIALIZED (SELECT id, "patientId" FROM "Session" WHERE "patientId" IN (${Prisma.join(patientIds)}))
        UPDATE "ProfilePictogram" pp
        SET "useCount" = u.uses, "daysUsed" = u.days, "lastUsedAt" = u.last
        FROM (
          SELECT pr.id AS "profileId", e.payload->>'pictogramId' AS "pictogramId", count(*)::int AS uses,
                 count(DISTINCT (e."occurredAt" - interval '5 hours')::date)::int AS days, max(e."occurredAt") AS last
          FROM s
          JOIN "Event" e ON e."sessionId" = s.id
          JOIN "Profile" pr ON pr."patientId" = s."patientId"
          WHERE e.type = 'pictogram_tapped' AND e.payload->>'pictogramId' IN (${Prisma.join(pictogramIds)})
          GROUP BY pr.id, e.payload->>'pictogramId'
        ) u
        WHERE pp."profileId" = u."profileId" AND pp."pictogramId" = u."pictogramId"`;
      const value = await nextSyncVersion(tx);
      await tx.profile.updateMany({ where: { patientId: { in: patientIds } }, data: { syncVersion: value } });
    });
  }
}
