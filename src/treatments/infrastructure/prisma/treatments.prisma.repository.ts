import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { anonymousPatientCode } from '../../../data-requests/domain/entities/data-request.entity';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProgressFilter, TreatmentProgress, TreatmentsRepository } from '../../domain/ports/treatments.repository';
import { isTherapistAssigned } from '../../../prisma/patient-access';

const planFields = { patientId: true, prescribedSessions: true, notes: true, updatedAt: true } as const;
const day = 24 * 60 * 60_000;

@Injectable()
export class TreatmentsPrismaRepository extends TreatmentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  getPlan(patientId: string) {
    return this.prisma.treatmentPlan.findUnique({ where: { patientId }, select: planFields });
  }

  savePlan(patientId: string, plan: { prescribedSessions: number; notes: string | null }, updatedBy: string) {
    const data = { ...plan, updatedBy };
    return this.prisma.treatmentPlan.upsert({ where: { patientId }, create: { patientId, ...data }, update: data, select: planFields });
  }

  isAssigned(patientId: string, therapistId: string) {
    return isTherapistAssigned(this.prisma, patientId, therapistId);
  }

  async patientCode(patientId: string) {
    return (await this.prisma.patient.findUnique({ where: { id: patientId }, select: { code: true } }))?.code ?? null;
  }

  // One page of patients, then every figure for that page at once: the work does not grow with the size of the center.
  async progress({ search, therapistId, specialty, status, includeNames }: ProgressFilter, page: PageRequest, now: Date) {
    const where: Prisma.PatientWhereInput = {
      code: { not: anonymousPatientCode },
      status,
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { code: { contains: search, mode: 'insensitive' } },
                  ...(includeNames
                    ? [
                        { firstNames: { contains: search, mode: 'insensitive' as const } },
                        { lastNames: { contains: search, mode: 'insensitive' as const } },
                      ]
                    : []),
                ],
              },
            ],
          }
        : {}),
      ...(therapistId || specialty ? { therapists: { some: { therapistId, therapist: specialty ? { specialty } : undefined } } } : {}),
    };
    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        select: {
          id: true,
          code: true,
          avatarId: true,
          status: true,
          firstNames: true,
          lastNames: true,
          treatmentPlan: { select: { prescribedSessions: true } },
          therapists: { select: { therapist: { select: { id: true, name: true, specialty: true } } } },
        },
        orderBy: [{ code: 'asc' }],
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.patient.count({ where }),
    ]);
    const ids = patients.map((p) => p.id);
    if (ids.length === 0) return toPage([] as TreatmentProgress[], total, page);

    const monthAgo = new Date(now.getTime() - 30 * day);
    const [counts, upcoming, sessions] = await Promise.all([
      this.prisma.appointment.groupBy({ by: ['patientId', 'status'], where: { patientId: { in: ids } }, _count: true }),
      this.prisma.appointment.findMany({
        where: { patientId: { in: ids }, status: 'SCHEDULED', startsAt: { gte: now } },
        distinct: ['patientId'],
        orderBy: [{ patientId: 'asc' }, { startsAt: 'asc' }],
        select: { patientId: true, startsAt: true, therapist: { select: { name: true } }, room: { select: { name: true } } },
      }),
      this.prisma.$queryRaw<{ patientId: string; lastSessionAt: Date | null; minutes: number }[]>`
        SELECT "patientId", max("startedAt") AS "lastSessionAt",
               coalesce(round(sum(extract(epoch FROM coalesce("endedAt", "startedAt") - "startedAt")) FILTER (WHERE "startedAt" >= ${monthAgo}) / 60), 0)::int AS minutes
        FROM "Session" WHERE "patientId" IN (${Prisma.join(ids)}) GROUP BY 1`,
    ]);
    const countOf = (patientId: string, wanted: string) =>
      counts.find((c) => c.patientId === patientId && c.status === wanted)?._count ?? 0;

    const items = patients.map((patient): TreatmentProgress => {
      const next = upcoming.find((a) => a.patientId === patient.id);
      const session = sessions.find((s) => s.patientId === patient.id);
      return {
        patientId: patient.id,
        code: patient.code,
        avatarId: patient.avatarId,
        status: patient.status,
        name: includeNames ? `${patient.firstNames} ${patient.lastNames}` : null,
        specialists: patient.therapists.map((t) => t.therapist),
        prescribedSessions: patient.treatmentPlan?.prescribedSessions ?? null,
        completedSessions: countOf(patient.id, 'COMPLETED'),
        scheduledSessions: countOf(patient.id, 'SCHEDULED'),
        missedSessions: countOf(patient.id, 'NO_SHOW'),
        nextAppointment: next ? { startsAt: next.startsAt, therapistName: next.therapist.name, roomName: next.room?.name ?? null } : null,
        lastSessionAt: session?.lastSessionAt ?? null,
        practiceMinutesLast30Days: session?.minutes ?? 0,
      };
    });
    return toPage(items, total, page);
  }
}
