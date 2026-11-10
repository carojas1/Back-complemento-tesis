import { Injectable } from '@nestjs/common';
import { anonymousPatientCode } from '../../../data-requests/domain/entities/data-request.entity';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { centerOffsetMs, centerWeekday, dayMs } from '../../../common/time/center-time';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import {
  AnalyticsFilter,
  AppUsage,
  AppUsageFilter,
  AttendanceCounts,
  CenterAnalytics,
  CenterOverview,
  DashboardReadModel,
  PatientUsageFilter,
  PatientUsagePage,
  PatientUsageSort,
} from '../../domain/ports/dashboard.read-model';

type Range = Parameters<DashboardReadModel['centerOverview']>[0];

const countOf = <K extends string>(rows: { _count: number }[], key: K, value: unknown) =>
  (rows as ({ _count: number } & Record<K, unknown>)[]).find((r) => r[key] === value)?._count ?? 0;

const ratio = (part: number, whole: number) => Math.round((1000 * part) / whole) / 10;
const sessionMinutes = Prisma.sql`extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt") / 60`;

// Fixed expressions, chosen from an enum: nothing from the request reaches the SQL text.
const usageOrder: Record<PatientUsageSort, Prisma.Sql> = {
  CODE: Prisma.sql`u.code ASC`,
  MINUTES: Prisma.sql`(u."therapyMinutes" + u."homeMinutes") DESC, u.code ASC`,
  LAST_SESSION: Prisma.sql`u."lastSessionAt" DESC NULLS LAST, u.code ASC`,
  NO_SHOWS: Prisma.sql`u."noShow" DESC, u.code ASC`,
};

// Minutes the center is open between two instants, walking its local days. No hours configured means unknown (0).
function minutesOpen(hours: { weekday: number; opensAt: number; closesAt: number }[], from: Date, to: Date) {
  if (hours.length === 0) return 0;
  let minutes = 0;
  const firstDay = Math.floor((from.getTime() - centerOffsetMs) / dayMs);
  const lastDay = Math.ceil((to.getTime() - centerOffsetMs) / dayMs);
  for (let d = firstDay; d < lastDay; d++) {
    const dayStart = d * dayMs + centerOffsetMs;
    const open = hours.find((h) => h.weekday === centerWeekday(new Date(dayStart)));
    if (!open) continue;
    const start = Math.max(dayStart + open.opensAt * 60_000, from.getTime());
    const end = Math.min(dayStart + open.closesAt * 60_000, to.getTime());
    if (end > start) minutes += (end - start) / 60_000;
  }
  return Math.round(minutes);
}

@Injectable()
export class DashboardPrismaReadModel extends DashboardReadModel {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async centerOverview(range: Range) {
    const { dayStart, dayEnd, weekEnd, staleBefore, monthAgo } = range;
    const p = this.prisma;
    const [[settings, therapists, parents, patients, devices, staleDevices, today, next7, openRequests, sessions], insights] =
      await Promise.all([
        Promise.all([
          p.centerSettings.findFirst({ select: { centerName: true } }),
          p.user.groupBy({ by: ['active'], where: { role: 'THERAPIST' }, _count: true }),
          p.user.count({ where: { role: 'PARENT', active: true } }),
          p.patient.groupBy({ by: ['status'], where: { code: { not: anonymousPatientCode } }, _count: true }),
          Promise.all([p.device.count({ where: { revokedAt: null } }), p.device.count({ where: { revokedAt: { not: null } } })]).then(
            ([active, revoked]) => ({ active, revoked }),
          ),
          // Same rule as Device.isStale: a tablet registered today is not stale yet.
          p.device.count({
            where: { revokedAt: null, OR: [{ lastSyncAt: { lt: staleBefore } }, { lastSyncAt: null, registeredAt: { lt: staleBefore } }] },
          }),
          p.appointment.groupBy({ by: ['status'], where: { startsAt: { gte: dayStart, lt: dayEnd } }, _count: true }),
          p.appointment.count({ where: { status: 'SCHEDULED', startsAt: { gte: dayEnd, lt: weekEnd } } }),
          p.dataRequest.count({ where: { status: 'OPEN' } }),
          p.session.count({ where: { kind: 'THERAPY', startedAt: { gte: monthAgo } } }),
        ]),
        this.insights(range),
      ]);

    const overview: CenterOverview = {
      centerName: settings?.centerName ?? '',
      therapists: { active: countOf(therapists, 'active', true), inactive: countOf(therapists, 'active', false) },
      parents,
      patients: { active: countOf(patients, 'status', 'ACTIVE'), discharged: countOf(patients, 'status', 'DISCHARGED') },
      devices: { ...devices, stale: staleDevices },
      appointmentsToday: {
        scheduled: countOf(today, 'status', 'SCHEDULED'),
        completed: countOf(today, 'status', 'COMPLETED'),
        canceled: countOf(today, 'status', 'CANCELED'),
        noShow: countOf(today, 'status', 'NO_SHOW'),
      },
      appointmentsNext7Days: next7,
      openDataRequests: openRequests,
      sessionsLast30Days: sessions,
      ...insights,
    };
    return overview;
  }

  // What the tablets synced (THERAPY sessions) and the agenda, counted per specialist, per patient and per week.
  private async insights({ now, dayEnd, weekEnd, monthAgo, weeks }: Range) {
    const p = this.prisma;
    const therapy = { kind: 'THERAPY' as const };
    const [attendance, therapists, assigned, sessions, booked, withoutTherapist, withoutSession, byWeek] = await Promise.all([
      p.appointment.groupBy({ by: ['status'], where: { startsAt: { gte: monthAgo, lt: now } }, _count: true }),
      p.user.findMany({
        where: { role: 'THERAPIST', active: true },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      p.therapistPatient.groupBy({ by: ['therapistId'], where: { patient: { status: 'ACTIVE' } }, _count: true }),
      p.session.groupBy({
        by: ['therapistId'],
        where: { ...therapy, startedAt: { gte: monthAgo }, therapistId: { not: null } },
        _count: true,
      }),
      p.appointment.groupBy({ by: ['therapistId'], where: { status: 'SCHEDULED', startsAt: { gte: dayEnd, lt: weekEnd } }, _count: true }),
      p.patient.count({ where: { status: 'ACTIVE', therapists: { none: {} } } }),
      p.patient.count({ where: { status: 'ACTIVE', sessions: { none: { ...therapy, startedAt: { gte: monthAgo } } } } }),
      // Ecuador local date = UTC minus 5 hours (as in src/sync); date_trunc('week') starts on Monday.
      p.$queryRaw<{ weekStart: string; sessions: number }[]>`
        SELECT to_char(date_trunc('week', "startedAt" - interval '5 hours'), 'YYYY-MM-DD') AS "weekStart", count(*)::int AS sessions
        FROM "Session" WHERE kind = 'THERAPY' AND "startedAt" >= ${weeks[0].from}
        GROUP BY 1`,
    ]);
    return {
      attendance: {
        completed: countOf(attendance, 'status', 'COMPLETED'),
        noShow: countOf(attendance, 'status', 'NO_SHOW'),
        canceled: countOf(attendance, 'status', 'CANCELED'),
      },
      therapistLoad: therapists.map(({ id, name }) => ({
        therapistId: id,
        name,
        activePatients: countOf(assigned, 'therapistId', id),
        sessionsLast30Days: countOf(sessions, 'therapistId', id),
        appointmentsNext7Days: countOf(booked, 'therapistId', id),
      })),
      followUp: { patientsWithoutTherapist: withoutTherapist, patientsWithoutSessionIn30Days: withoutSession },
      // Every week, including those without sessions.
      sessionsByWeek: weeks.map(({ weekStart }) => ({ weekStart, sessions: byWeek.find((w) => w.weekStart === weekStart)?.sessions ?? 0 })),
    };
  }

  // Everything is grouped in the database and bounded by the period; the indexes on (institutionId, status, startsAt) and
  // (institutionId, startedAt) keep it fast as the history grows.
  async analytics({ from, to, therapistId, specialty }: AnalyticsFilter): Promise<CenterAnalytics> {
    const p = this.prisma;
    const scope: Prisma.AppointmentWhereInput = {
      startsAt: { gte: from, lt: to },
      therapistId,
      ...(specialty ? { therapist: { specialty } } : {}),
    };
    const appointmentScope = Prisma.sql`a."startsAt" >= ${from} AND a."startsAt" < ${to}
      ${therapistId ? Prisma.sql`AND a."therapistId" = ${therapistId}` : Prisma.empty}
      ${specialty ? Prisma.sql`AND u."specialty" = ${specialty}` : Prisma.empty}`;
    const sessionScope = Prisma.sql`s."startedAt" >= ${from} AND s."startedAt" < ${to}
      ${therapistId ? Prisma.sql`AND s."patientId" IN (SELECT "patientId" FROM "TherapistPatient" WHERE "therapistId" = ${therapistId})` : Prisma.empty}
      ${specialty ? Prisma.sql`AND s."patientId" IN (SELECT tp."patientId" FROM "TherapistPatient" tp JOIN "User" tu ON tu.id = tp."therapistId" WHERE tu."specialty" = ${specialty})` : Prisma.empty}`;

    const [statuses, weekly, attended, practice, practiceWeekly, booked, rooms, hours, perTherapist, therapists] = await Promise.all([
      p.appointment.groupBy({ by: ['status'], where: scope, _count: true }),
      p.$queryRaw<{ weekStart: string; completed: number; noShow: number; canceled: number }[]>`
        SELECT to_char(date_trunc('week', a."startsAt" - interval '5 hours'), 'YYYY-MM-DD') AS "weekStart",
               count(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
               count(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS "noShow",
               count(*) FILTER (WHERE a.status = 'CANCELED')::int AS canceled
        FROM "Appointment" a JOIN "User" u ON u.id = a."therapistId"
        WHERE ${appointmentScope} GROUP BY 1 ORDER BY 1`,
      p.$queryRaw<{ count: number }[]>`
        SELECT count(DISTINCT a."patientId")::int AS count
        FROM "Appointment" a JOIN "User" u ON u.id = a."therapistId"
        WHERE ${appointmentScope} AND a.status = 'COMPLETED'`,
      p.$queryRaw<{ therapyMinutes: number; homeMinutes: number; sessions: number }[]>`
        SELECT coalesce(round(sum(extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt")) FILTER (WHERE s.kind = 'THERAPY') / 60), 0)::int AS "therapyMinutes",
               coalesce(round(sum(extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt")) FILTER (WHERE s.kind = 'HOME') / 60), 0)::int AS "homeMinutes",
               count(*)::int AS sessions
        FROM "Session" s WHERE ${sessionScope}`,
      p.$queryRaw<{ weekStart: string; therapyMinutes: number; homeMinutes: number }[]>`
        SELECT to_char(date_trunc('week', s."startedAt" - interval '5 hours'), 'YYYY-MM-DD') AS "weekStart",
               coalesce(round(sum(extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt")) FILTER (WHERE s.kind = 'THERAPY') / 60), 0)::int AS "therapyMinutes",
               coalesce(round(sum(extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt")) FILTER (WHERE s.kind = 'HOME') / 60), 0)::int AS "homeMinutes"
        FROM "Session" s WHERE ${sessionScope} GROUP BY 1 ORDER BY 1`,
      p.$queryRaw<{ roomId: string; minutes: number }[]>`
        SELECT a."roomId", round(sum(extract(epoch FROM a."endsAt" - a."startsAt")) / 60)::int AS minutes
        FROM "Appointment" a JOIN "User" u ON u.id = a."therapistId"
        WHERE ${appointmentScope} AND a."roomId" IS NOT NULL AND a.status IN ('SCHEDULED', 'COMPLETED') GROUP BY 1`,
      p.room.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      p.centerHours.findMany({ select: { weekday: true, opensAt: true, closesAt: true } }),
      p.$queryRaw<{ therapistId: string; completed: number; noShow: number; canceled: number; patients: number }[]>`
        SELECT a."therapistId",
               count(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
               count(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS "noShow",
               count(*) FILTER (WHERE a.status = 'CANCELED')::int AS canceled,
               count(DISTINCT a."patientId") FILTER (WHERE a.status = 'COMPLETED')::int AS patients
        FROM "Appointment" a JOIN "User" u ON u.id = a."therapistId"
        WHERE ${appointmentScope} GROUP BY 1`,
      p.user.findMany({
        where: { role: 'THERAPIST', active: true, id: therapistId, specialty },
        select: { id: true, name: true, specialty: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
    ]);

    const completed = countOf(statuses, 'status', 'COMPLETED');
    const noShow = countOf(statuses, 'status', 'NO_SHOW');
    const openMinutes = minutesOpen(hours, from, to);
    const roomRows = rooms.map(({ id, name }) => {
      const bookedMinutes = booked.find((b) => b.roomId === id)?.minutes ?? 0;
      return { roomId: id, name, bookedMinutes, openMinutes, rate: openMinutes > 0 ? ratio(bookedMinutes, openMinutes) : null };
    });
    const totalOpen = openMinutes * rooms.length;
    const byTherapist = therapists.map(({ id, name, specialty: area }) => {
      const row = perTherapist.find((t) => t.therapistId === id);
      return {
        therapistId: id,
        name,
        specialty: area,
        patients: row?.patients ?? 0,
        completed: row?.completed ?? 0,
        noShow: row?.noShow ?? 0,
        canceled: row?.canceled ?? 0,
      };
    });
    const specialties = new Map<string, AttendanceCounts>();
    for (const { specialty: area, completed: c, noShow: n, canceled: x } of byTherapist) {
      const key = area ?? 'Sin especialidad';
      const sum = specialties.get(key) ?? { completed: 0, noShow: 0, canceled: 0 };
      specialties.set(key, { completed: sum.completed + c, noShow: sum.noShow + n, canceled: sum.canceled + x });
    }
    return {
      attendance: {
        completed,
        noShow,
        canceled: countOf(statuses, 'status', 'CANCELED'),
        scheduled: countOf(statuses, 'status', 'SCHEDULED'),
        rate: completed + noShow > 0 ? ratio(completed, completed + noShow) : null,
      },
      attendanceByWeek: weekly,
      patientsAttended: attended[0]?.count ?? 0,
      practice: practice[0] ?? { therapyMinutes: 0, homeMinutes: 0, sessions: 0 },
      practiceByWeek: practiceWeekly,
      occupancy: {
        rate:
          totalOpen > 0
            ? ratio(
                roomRows.reduce((n, r) => n + r.bookedMinutes, 0),
                totalOpen,
              )
            : null,
        rooms: roomRows,
      },
      bySpecialty: [...specialties]
        .map(([area, counts]) => ({ specialty: area, ...counts }))
        .sort((a, b) => a.specialty.localeCompare(b.specialty)),
      byTherapist,
    };
  }

  async patientUsage(filter: PatientUsageFilter, page: PageRequest): Promise<PatientUsagePage> {
    const p = this.prisma;
    const { from, to, therapistId, search, flag, sort, withResults } = filter;
    const pattern = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : undefined;
    const usage = Prisma.sql`
      SELECT pa.id, pa.code, pa."firstNames", pa."lastNames", av."imagePath" AS "avatarPath",
             coalesce(a.completed, 0) AS completed, coalesce(a."noShow", 0) AS "noShow", coalesce(a.canceled, 0) AS canceled,
             coalesce(t."therapySessions", 0) AS "therapySessions", coalesce(t."homeSessions", 0) AS "homeSessions",
             coalesce(t."therapyMinutes", 0) AS "therapyMinutes", coalesce(t."homeMinutes", 0) AS "homeMinutes",
             (SELECT max(last."startedAt") FROM "Session" last WHERE last."patientId" = pa.id) AS "lastSessionAt",
             (SELECT min(soon."startsAt") FROM "Appointment" soon
               WHERE soon."patientId" = pa.id AND soon.status = 'SCHEDULED' AND soon."startsAt" >= now()
               ${therapistId ? Prisma.sql`AND soon."therapistId" = ${therapistId}` : Prisma.empty}) AS "nextAppointmentAt"
      FROM "Patient" pa
      JOIN "Avatar" av ON av.id = pa."avatarId"
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE ap.status = 'COMPLETED')::int AS completed,
               count(*) FILTER (WHERE ap.status = 'NO_SHOW')::int AS "noShow",
               count(*) FILTER (WHERE ap.status = 'CANCELED')::int AS canceled
        FROM "Appointment" ap
        WHERE ap."patientId" = pa.id AND ap."startsAt" >= ${from} AND ap."startsAt" < ${to}
          ${therapistId ? Prisma.sql`AND ap."therapistId" = ${therapistId}` : Prisma.empty}
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE s.kind = 'THERAPY')::int AS "therapySessions",
               count(*) FILTER (WHERE s.kind = 'HOME')::int AS "homeSessions",
               coalesce(round(sum(${sessionMinutes}) FILTER (WHERE s.kind = 'THERAPY')), 0)::int AS "therapyMinutes",
               coalesce(round(sum(${sessionMinutes}) FILTER (WHERE s.kind = 'HOME')), 0)::int AS "homeMinutes"
        FROM "Session" s
        WHERE s."patientId" = pa.id AND s."startedAt" >= ${from} AND s."startedAt" < ${to}
      ) t ON true
      WHERE pa.code <> ${anonymousPatientCode} AND pa.status = 'ACTIVE'
        ${therapistId ? Prisma.sql`AND pa.id IN (SELECT "patientId" FROM "TherapistPatient" WHERE "therapistId" = ${therapistId})` : Prisma.empty}
        ${pattern ? Prisma.sql`AND (pa.code ILIKE ${pattern} OR pa."firstNames" ILIKE ${pattern} OR pa."lastNames" ILIKE ${pattern})` : Prisma.empty}`;
    const flagged =
      flag === 'NO_PRACTICE'
        ? Prisma.sql`WHERE u."therapySessions" + u."homeSessions" = 0`
        : flag === 'NO_SHOWS'
          ? Prisma.sql`WHERE u."noShow" > 0`
          : Prisma.empty;

    const [rows, tally] = await Promise.all([
      p.$queryRaw<
        {
          id: string;
          code: string;
          firstNames: string;
          lastNames: string;
          avatarPath: string;
          completed: number;
          noShow: number;
          canceled: number;
          therapySessions: number;
          homeSessions: number;
          therapyMinutes: number;
          homeMinutes: number;
          lastSessionAt: Date | null;
          nextAppointmentAt: Date | null;
        }[]
      >`SELECT u.* FROM (${usage}) u ${flagged} ORDER BY ${usageOrder[sort]} LIMIT ${page.limit} OFFSET ${skipOf(page)}`,
      p.$queryRaw<{ all: number; noPractice: number; noShows: number }[]>`
        SELECT count(*)::int AS "all",
               count(*) FILTER (WHERE u."therapySessions" + u."homeSessions" = 0)::int AS "noPractice",
               count(*) FILTER (WHERE u."noShow" > 0)::int AS "noShows"
        FROM (${usage}) u`,
    ]);

    const ids = rows.map((row) => row.id);
    const [weeks, assigned, results] = await Promise.all([
      ids.length === 0
        ? ([] as { patientId: string; weekStart: string; minutes: number }[])
        : p.$queryRaw<{ patientId: string; weekStart: string; minutes: number }[]>`
            SELECT s."patientId", to_char(date_trunc('week', s."startedAt" - interval '5 hours'), 'YYYY-MM-DD') AS "weekStart",
                   round(sum(${sessionMinutes}))::int AS minutes
            FROM "Session" s
            WHERE s."patientId" = ANY(${ids}) AND s."startedAt" >= ${from} AND s."startedAt" < ${to}
            GROUP BY 1, 2 ORDER BY 2`,
      p.therapistPatient.findMany({
        where: { patientId: { in: ids }, therapist: { active: true } },
        select: { patientId: true, therapist: { select: { name: true } } },
        orderBy: { therapist: { name: 'asc' } },
      }),
      withResults && ids.length > 0
        ? p.$queryRaw<{ patientId: string; correct: number; answered: number }[]>`
            SELECT s."patientId", count(*) FILTER (WHERE r.correct AND r."firstAttempt")::int AS correct, count(*) FILTER (WHERE r."firstAttempt")::int AS answered
            FROM "ActivityResult" r JOIN "ActivityRun" run ON run.id = r."runId" JOIN "Session" s ON s.id = run."sessionId"
            WHERE s."patientId" = ANY(${ids}) AND s."startedAt" >= ${from} AND s."startedAt" < ${to}
            GROUP BY 1`
        : ([] as { patientId: string; correct: number; answered: number }[]),
    ]);

    const counts = tally[0] ?? { all: 0, noPractice: 0, noShows: 0 };
    const total = flag === 'NO_PRACTICE' ? counts.noPractice : flag === 'NO_SHOWS' ? counts.noShows : counts.all;
    const items = rows.map((row) => {
      const answers = results.find((r) => r.patientId === row.id && r.answered > 0);
      return {
        patientId: row.id,
        code: row.code,
        firstNames: row.firstNames,
        lastNames: row.lastNames,
        avatarPath: row.avatarPath,
        therapists: assigned.filter((a) => a.patientId === row.id).map((a) => a.therapist.name),
        attendance: {
          completed: row.completed,
          noShow: row.noShow,
          canceled: row.canceled,
          rate: row.completed + row.noShow > 0 ? ratio(row.completed, row.completed + row.noShow) : null,
        },
        sessions: { therapy: row.therapySessions, home: row.homeSessions },
        minutes: { therapy: row.therapyMinutes, home: row.homeMinutes },
        lastSessionAt: row.lastSessionAt,
        nextAppointmentAt: row.nextAppointmentAt,
        practiceByWeek: weeks.filter((w) => w.patientId === row.id).map(({ weekStart, minutes }) => ({ weekStart, minutes })),
        ...(withResults ? { correctRate: answers ? ratio(answers.correct, answers.answered) : null } : {}),
      };
    });
    return { ...toPage(items, total, page), counts };
  }

  async appUsage({ from, to, previousFrom, therapistId, withDevices, staleBefore }: AppUsageFilter): Promise<AppUsage> {
    const p = this.prisma;
    const assigned = therapistId
      ? Prisma.sql`AND s."patientId" IN (SELECT "patientId" FROM "TherapistPatient" WHERE "therapistId" = ${therapistId})`
      : Prisma.empty;
    const inPeriod = Prisma.sql`s."startedAt" >= ${from} AND s."startedAt" < ${to} ${assigned}`;
    const realPatient = Prisma.sql`s."patientId" IN (SELECT id FROM "Patient" WHERE code <> ${anonymousPatientCode})`;

    const [totals, previous, activePatients, byDay, byHour, communication, runs, devices] = await Promise.all([
      p.$queryRaw<
        {
          therapySessions: number;
          homeSessions: number;
          therapyMinutes: number;
          homeMinutes: number;
          practicingPatients: number;
          activeDays: number;
        }[]
      >`
        SELECT count(*) FILTER (WHERE s.kind = 'THERAPY')::int AS "therapySessions",
               count(*) FILTER (WHERE s.kind = 'HOME')::int AS "homeSessions",
               coalesce(round(sum(${sessionMinutes}) FILTER (WHERE s.kind = 'THERAPY')), 0)::int AS "therapyMinutes",
               coalesce(round(sum(${sessionMinutes}) FILTER (WHERE s.kind = 'HOME')), 0)::int AS "homeMinutes",
               count(DISTINCT s."patientId") FILTER (WHERE ${realPatient})::int AS "practicingPatients",
               count(DISTINCT (s."startedAt" - interval '5 hours')::date)::int AS "activeDays"
        FROM "Session" s WHERE ${inPeriod}`,
      p.$queryRaw<{ sessions: number; minutes: number; practicingPatients: number }[]>`
        SELECT count(*)::int AS sessions, coalesce(round(sum(${sessionMinutes})), 0)::int AS minutes,
               count(DISTINCT s."patientId") FILTER (WHERE ${realPatient})::int AS "practicingPatients"
        FROM "Session" s WHERE s."startedAt" >= ${previousFrom} AND s."startedAt" < ${from} ${assigned}`,
      p.patient.count({
        where: { status: 'ACTIVE', code: { not: anonymousPatientCode }, ...(therapistId ? { therapists: { some: { therapistId } } } : {}) },
      }),
      p.$queryRaw<{ day: string; sessions: number; minutes: number }[]>`
        SELECT to_char(s."startedAt" - interval '5 hours', 'YYYY-MM-DD') AS day, count(*)::int AS sessions,
               round(sum(${sessionMinutes}))::int AS minutes
        FROM "Session" s WHERE ${inPeriod} GROUP BY 1 ORDER BY 1`,
      p.$queryRaw<{ weekday: number; hour: number; sessions: number }[]>`
        SELECT extract(dow FROM s."startedAt" - interval '5 hours')::int AS weekday,
               extract(hour FROM s."startedAt" - interval '5 hours')::int AS hour, count(*)::int AS sessions
        FROM "Session" s WHERE ${inPeriod} GROUP BY 1, 2`,
      p.$queryRaw<{ pictogramsTapped: number; phrasesSpoken: number }[]>`
        SELECT count(*) FILTER (WHERE e.type = 'pictogram_tapped')::int AS "pictogramsTapped",
               count(*) FILTER (WHERE e.type = 'sentence_spoken')::int AS "phrasesSpoken"
        FROM "Event" e JOIN "Session" s ON s.id = e."sessionId" WHERE ${inPeriod}`,
      p.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "ActivityRun" r JOIN "Session" s ON s.id = r."sessionId" WHERE ${inPeriod}`,
      withDevices
        ? p.$queryRaw<{ deviceId: string; name: string; lastSyncAt: Date | null; registeredAt: Date; sessions: number; minutes: number }[]>`
            SELECT d.id AS "deviceId", d.name, d."lastSyncAt", d."registeredAt",
                   count(s.id)::int AS sessions, coalesce(round(sum(${sessionMinutes})), 0)::int AS minutes
            FROM "Device" d LEFT JOIN "Session" s ON s."deviceId" = d.id AND ${inPeriod}
            WHERE d."revokedAt" IS NULL GROUP BY d.id ORDER BY sessions DESC, d.name ASC LIMIT 100`
        : ([] as { deviceId: string; name: string; lastSyncAt: Date | null; registeredAt: Date; sessions: number; minutes: number }[]),
    ]);

    const sum = totals[0];
    return {
      sessions: sum.therapySessions + sum.homeSessions,
      minutes: sum.therapyMinutes + sum.homeMinutes,
      practicingPatients: sum.practicingPatients,
      therapy: { sessions: sum.therapySessions, minutes: sum.therapyMinutes },
      home: { sessions: sum.homeSessions, minutes: sum.homeMinutes },
      activePatients,
      activeDays: sum.activeDays,
      previous: previous[0],
      byDay,
      byHour,
      communication: communication[0],
      activityRuns: runs[0]?.count ?? 0,
      ...(withDevices
        ? {
            // Same rule as Device.isStale: a tablet registered today is not stale yet.
            devices: devices.map(({ registeredAt, ...device }) => ({
              ...device,
              stale: (device.lastSyncAt ?? registeredAt) < staleBefore,
            })),
          }
        : {}),
    };
  }
}
