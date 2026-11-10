import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { Period, SessionsReadModel, SessionSummary } from '../../domain/ports/sessions.read-model';

type Row = Omit<SessionSummary, 'activity'> & { correct: number; total: number };

// Totals per session in a single query (spec 107 FR-001: always from the events).
const summaries = (where: Prisma.Sql, page?: PageRequest) => Prisma.sql`
  SELECT s.id, s.kind, s."homeworkId", s."startedAt", s."endedAt", s."therapistVerified", g.name AS "guardianName",
         CASE WHEN s."endedAt" IS NULL THEN NULL ELSE round(extract(epoch FROM s."endedAt" - s."startedAt") / 60)::int END AS "durationMin",
         u.name AS "therapistName", d.name AS "deviceName",
         (SELECT count(*)::int FROM "Event" e WHERE e."sessionId" = s.id AND e.type = 'pictogram_tapped') AS taps,
         (SELECT count(*)::int FROM "Event" e WHERE e."sessionId" = s.id AND e.type = 'sentence_spoken') AS sentences,
         (SELECT count(*) FILTER (WHERE r.correct AND r."firstAttempt")::int FROM "ActivityResult" r JOIN "ActivityRun" a ON a.id = r."runId" WHERE a."sessionId" = s.id) AS correct,
         (SELECT count(*) FILTER (WHERE r."firstAttempt")::int FROM "ActivityResult" r JOIN "ActivityRun" a ON a.id = r."runId" WHERE a."sessionId" = s.id) AS total
  FROM "Session" s
  LEFT JOIN "Device" d ON d.id = s."deviceId"
  LEFT JOIN "User" u ON u.id = s."therapistId"
  LEFT JOIN "User" g ON g.id = s."guardianId"
  WHERE ${where}
  ORDER BY s."startedAt" DESC, s.id DESC
  ${page ? Prisma.sql`LIMIT ${page.limit} OFFSET ${skipOf(page)}` : Prisma.empty}`;

const toSummary = ({ correct, total, ...row }: Row): SessionSummary => ({ ...row, activity: { correct, total } });
const inPeriod = (patientId: string, { from, to }: Partial<Period>) =>
  Prisma.sql`s."patientId" = ${patientId} AND s."startedAt" >= ${from ?? new Date(0)} AND s."startedAt" <= ${to ?? new Date('2999-01-01')}`;

@Injectable()
export class SessionsPrismaReadModel extends SessionsReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(patientId: string, period: Partial<Period>, page: PageRequest) {
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(summaries(inPeriod(patientId, period), page)),
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "Session" s WHERE ${inPeriod(patientId, period)}`,
    ]);
    return toPage(rows.map(toSummary), total, page);
  }

  async find(sessionId: string) {
    const [row] = await this.prisma.$queryRaw<Row[]>(summaries(Prisma.sql`s.id = ${sessionId}`));
    if (!row) return null;
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        patientId: true,
        patient: { select: { code: true } },
        events: { orderBy: { occurredAt: 'asc' }, select: { occurredAt: true, type: true, payload: true } },
        activityRuns: { select: { results: { orderBy: { answeredAt: 'asc' } } } },
      },
    });
    const raw = session.activityRuns.flatMap((run) => run.results);
    const ids = [...new Set(raw.flatMap((r) => [r.targetPictogramId, r.chosenPictogramId]))];
    const labels = new Map(
      (await this.prisma.pictogram.findMany({ where: { id: { in: ids } }, select: { id: true, label: true } })).map((p) => [p.id, p.label]),
    );
    const results = raw.map((r) => ({
      answeredAt: r.answeredAt,
      target: labels.get(r.targetPictogramId) ?? '?',
      chosen: labels.get(r.chosenPictogramId) ?? '?',
      correct: r.correct,
      firstAttempt: r.firstAttempt,
      responseMs: r.responseMs,
    }));
    return { ...toSummary(row), patientId: session.patientId, patientCode: session.patient.code, events: session.events, results };
  }

  // Spec 107 FR-002: distinct words, top 10, average phrase length and first-attempt correct answers, per week.
  // Therapy sessions only: home practice (spec 112) shows in the list, separately, and does not mix into the indicators.
  async report(patientId: string, period: Period) {
    const where = Prisma.sql`${inPeriod(patientId, period)} AND s.kind = 'THERAPY'`;
    const [[totals], topWords, sentences, accuracy, [stale], practiceByWeek] = await Promise.all([
      this.prisma.$queryRaw<{ sessions: number; minutes: number; distinctWords: number }[]>`
        SELECT count(*)::int AS sessions,
               coalesce(round(sum(extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt")) / 60), 0)::int AS minutes,
               (SELECT count(DISTINCT e.payload->>'word')::int FROM "Event" e JOIN "Session" s ON s.id = e."sessionId"
                WHERE ${where} AND e.type = 'pictogram_tapped') AS "distinctWords"
        FROM "Session" s WHERE ${where}`,
      this.prisma.$queryRaw<{ word: string; count: number }[]>`
        SELECT e.payload->>'word' AS word, count(*)::int AS count
        FROM "Event" e JOIN "Session" s ON s.id = e."sessionId"
        WHERE ${where} AND e.type = 'pictogram_tapped'
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`,
      this.prisma.$queryRaw<{ week: Date; mean: number }[]>`
        SELECT date_trunc('week', e."occurredAt" - interval '5 hours') AS week, round(avg((e.payload->>'length')::numeric), 1)::float AS mean
        FROM "Event" e JOIN "Session" s ON s.id = e."sessionId"
        WHERE ${where} AND e.type = 'sentence_spoken' GROUP BY 1`,
      this.prisma.$queryRaw<{ week: Date; accuracy: number }[]>`
        SELECT date_trunc('week', r."answeredAt" - interval '5 hours') AS week,
               round(100.0 * count(*) FILTER (WHERE r.correct AND r."firstAttempt") / nullif(count(*) FILTER (WHERE r."firstAttempt"), 0))::int AS accuracy
        FROM "ActivityResult" r JOIN "ActivityRun" a ON a.id = r."runId" JOIN "Session" s ON s.id = a."sessionId"
        WHERE ${where} GROUP BY 1`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "Device" WHERE "revokedAt" IS NULL AND ("lastSyncAt" IS NULL OR "lastSyncAt" < now() - interval '24 hours')`,
      this.prisma.$queryRaw<{ week: string; sessions: number; therapyMinutes: number; homeMinutes: number }[]>`
        SELECT to_char(date_trunc('week', s."startedAt" - interval '5 hours'), 'YYYY-MM-DD') AS week,
               count(*)::int AS sessions,
               coalesce(round(sum(extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt")) FILTER (WHERE s.kind = 'THERAPY') / 60), 0)::int AS "therapyMinutes",
               coalesce(round(sum(extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt")) FILTER (WHERE s.kind = 'HOME') / 60), 0)::int AS "homeMinutes"
        FROM "Session" s WHERE ${inPeriod(patientId, period)} GROUP BY 1 ORDER BY 1`,
    ]);
    const key = (date: Date) => date.toISOString().slice(0, 10);
    const weeks = [...new Set([...sentences, ...accuracy].map((w) => key(w.week)))].sort();
    return {
      ...totals,
      topWords,
      weeks: weeks.map((week) => ({
        week,
        meanSentenceLength: sentences.find((w) => key(w.week) === week)?.mean ?? null,
        accuracy: accuracy.find((w) => key(w.week) === week)?.accuracy ?? null,
      })),
      practiceByWeek,
      staleDevices: stale.count,
    };
  }

  async patientCode(patientId: string) {
    return (await this.prisma.patient.findUnique({ where: { id: patientId }, select: { code: true } }))?.code ?? null;
  }

  // Period observations and objectives in force during it (created before the end and ongoing or changed within the period).
  async reportContext(patientId: string, { from, to }: Period) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        code: true,
        firstNames: true,
        lastNames: true,
        createdAt: true,
        notes: {
          where: { createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: 'asc' },
          take: 500,
          select: { createdAt: true, text: true, author: { select: { name: true } } },
        },
        goals: {
          where: { createdAt: { lte: to }, OR: [{ status: 'IN_PROGRESS' }, { updatedAt: { gte: from } }] },
          orderBy: { createdAt: 'asc' },
          take: 200,
          select: { createdAt: true, text: true, status: true, targetDate: true },
        },
        treatmentPlan: { select: { prescribedSessions: true } },
        sessions: {
          where: { startedAt: { gte: from, lte: to } },
          orderBy: { startedAt: 'asc' },
          take: 500,
          select: { startedAt: true, endedAt: true, kind: true, therapist: { select: { name: true } } },
        },
        appointments: {
          where: { startsAt: { gte: from, lte: to } },
          orderBy: { startsAt: 'asc' },
          take: 500,
          select: { startsAt: true, status: true, therapist: { select: { name: true } }, room: { select: { name: true } } },
        },
      },
    });
    if (!patient) return null;
    const { notes, treatmentPlan, sessions, appointments, ...rest } = patient;
    return {
      ...rest,
      prescribedSessions: treatmentPlan?.prescribedSessions ?? null,
      notes: notes.map(({ author, ...note }) => ({ ...note, authorName: author.name })),
      sessions: sessions.map(({ startedAt, endedAt, kind, therapist }) => ({
        startedAt,
        kind,
        minutes: Math.round(((endedAt ?? startedAt).getTime() - startedAt.getTime()) / 60_000),
        therapistName: therapist?.name ?? null,
      })),
      appointments: appointments.map(({ startsAt, status, therapist, room }) => ({
        startsAt,
        status,
        therapistName: therapist.name,
        roomName: room?.name ?? null,
      })),
    };
  }
}
