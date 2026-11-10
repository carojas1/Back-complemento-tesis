import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { anonymousPatientCode } from '../../../data-requests/domain/entities/data-request.entity';
import { Patient } from '../../domain/entities/patient.entity';
import { PatientFilter, PatientsRepository } from '../../domain/ports/patients.repository';
import { patientInclude, PatientsPrismaMapper as M } from './patients.prisma.mapper';
import { isTherapistAssigned } from '../../../prisma/patient-access';

const linkedTo = (userId: string): Prisma.PatientWhereInput => ({
  OR: [{ therapists: { some: { therapistId: userId } } }, { guardians: { some: { guardianId: userId } } }],
});

@Injectable()
export class PatientsPrismaRepository extends PatientsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Sequential per institution (spec 113 FR-004) and never reused: the UPDATE locks the row, so two simultaneous registrations
  // get different numbers.
  async nextCode() {
    const [{ value }] = await this.prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO "CenterSettings" ("institutionId", "lastPatientNumber") VALUES (current_institution(), 1)
      ON CONFLICT ("institutionId") DO UPDATE SET "lastPatientNumber" = "CenterSettings"."lastPatientNumber" + 1
      RETURNING "lastPatientNumber" AS value`;
    return `P-${String(value).padStart(4, '0')}`;
  }

  // Saves the record and its conditions; with `therapistIds` (registration) also the assignment.
  async save(patient: Patient, therapistIds?: string[]) {
    const data = M.toPrisma(patient);
    await this.prisma.$transaction([
      this.prisma.patient.upsert({ where: { id: data.id }, create: data, update: data }),
      this.prisma.patientCondition.deleteMany({ where: { patientId: data.id } }),
      this.prisma.patientCondition.createMany({ data: patient.conditionIds.map((conditionId) => ({ patientId: data.id, conditionId })) }),
      ...(therapistIds
        ? [this.prisma.therapistPatient.createMany({ data: therapistIds.map((therapistId) => ({ therapistId, patientId: data.id })) })]
        : []),
    ]);
  }

  async find(id: string) {
    const row = await this.prisma.patient.findUnique({ where: { id }, include: patientInclude });
    return row ? M.toSummary(row) : null;
  }

  async list({ search, status, therapistId, excludeTherapistId }: PatientFilter, page: PageRequest) {
    const where: Prisma.PatientWhereInput = {
      code: { not: anonymousPatientCode }, // technical patient for anonymous sessions (spec 110): not a person
      status,
      // The id belongs to a therapist or a guardian (spec 112): their patients or children, or those they do not have yet.
      AND: therapistId ? [linkedTo(therapistId)] : excludeTherapistId ? [{ NOT: linkedTo(excludeTherapistId) }] : undefined,
      OR: search ? ['code', 'firstNames', 'lastNames'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({ where, include: patientInclude, orderBy: { code: 'asc' }, skip: skipOf(page), take: page.limit }),
      this.prisma.patient.count({ where }),
    ]);
    return toPage(
      rows.map((row) => M.toSummary(row)),
      total,
      page,
    );
  }

  isAssigned(patientId: string, therapistId: string) {
    return isTherapistAssigned(this.prisma, patientId, therapistId);
  }

  async administrativeFacts(patientId: string) {
    const [row, devices] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { createdAt: true } }),
      this.prisma.$queryRaw<{ deviceId: string; name: string; sessions: number; minutes: number; lastSessionAt: Date | null }[]>`
        SELECT d.id AS "deviceId", d.name, count(*)::int AS sessions,
               coalesce(round(sum(extract(epoch FROM coalesce(s."endedAt", s."startedAt") - s."startedAt")) / 60), 0)::int AS minutes,
               max(s."startedAt") AS "lastSessionAt"
        FROM "Session" s JOIN "Device" d ON d.id = s."deviceId"
        WHERE s."patientId" = ${patientId}
        GROUP BY d.id, d.name
        ORDER BY max(s."startedAt") DESC`,
    ]);
    return row ? { registeredAt: row.createdAt, devices } : null;
  }

  async activeTherapistIds(ids: string[]) {
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids }, role: 'THERAPIST', active: true }, select: { id: true } });
    return rows.map((row) => row.id);
  }
}
