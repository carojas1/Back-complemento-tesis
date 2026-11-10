import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { accountKey } from '../../../auth/infrastructure/prisma/auth.prisma.repository';
import { deviceKey } from '../../../devices/infrastructure/prisma/devices.prisma.repository';
import { User } from '../../../auth/domain/entities/user.entity';
import { EmailTaken } from '../../../auth/domain/exceptions/auth.exceptions';
import { AuthPrismaMapper } from '../../../auth/infrastructure/prisma/auth.prisma.mapper';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { asSystem, baseInstitutionId as base } from '../../../tenancy/tenancy';
import { effectiveStatusOf, Subscription } from '../../../subscriptions/domain/entities/subscription.entity';
import { InstitutionChanges, InstitutionRequest, openStatuses, RequestStatus } from '../../domain/entities/institution-request.entity';
import { InstitutionFilter, InstitutionsRepository, NewRequest, TemplateAvatar } from '../../domain/ports/institutions.repository';

const toRequest = ({ ip: _, ...row }: Prisma.InstitutionRequestGetPayload<object>): InstitutionRequest => row;
const open = { in: openStatuses };
const dayMs = 24 * 60 * 60_000;

@Injectable()
export class InstitutionsPrismaRepository extends InstitutionsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super();
  }

  async createRequest(request: NewRequest) {
    return toRequest(await asSystem(() => this.prisma.institutionRequest.create({ data: request })));
  }

  async pendingWithRuc(ruc: string) {
    return !!(await asSystem(() => this.prisma.institutionRequest.findFirst({ where: { ruc, status: open }, select: { id: true } })));
  }

  async institutionWithRuc(ruc: string) {
    return !!(await asSystem(() => this.prisma.institution.findUnique({ where: { ruc }, select: { id: true } })));
  }

  async listRequests(status: RequestStatus | undefined, page: PageRequest) {
    const where = { status };
    const [rows, total] = await asSystem(() =>
      Promise.all([
        this.prisma.institutionRequest.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: skipOf(page),
          take: page.limit,
        }),
        this.prisma.institutionRequest.count({ where }),
      ]),
    );
    return toPage(rows.map(toRequest), total, page);
  }

  async findRequest(id: string) {
    const row = await asSystem(() => this.prisma.institutionRequest.findUnique({ where: { id } }));
    return row && toRequest(row);
  }

  async startReview(id: string, reviewerId: string, notes: string, now: Date) {
    const { count } = await asSystem(() =>
      this.prisma.institutionRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'IN_REVIEW', contactedAt: now, reviewedBy: reviewerId, reviewNotes: notes },
      }),
    );
    return count === 1;
  }

  async saveReviewNotes(id: string, notes: string) {
    const { count } = await asSystem(() =>
      this.prisma.institutionRequest.updateMany({ where: { id, status: open }, data: { reviewNotes: notes } }),
    );
    return count === 1;
  }

  templateAvatars(): Promise<TemplateAvatar[]> {
    return asSystem(() =>
      this.prisma.avatar.findMany({ where: { institutionId: base }, select: { name: true, imagePath: true, active: true } }),
    );
  }

  approve(request: InstitutionRequest, admin: User, avatars: TemplateAvatar[], reviewerId: string, now: Date) {
    return asSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const { count } = await tx.institutionRequest.updateMany({
          where: { id: request.id, status: open },
          data: { status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: now },
        });
        if (count === 0) return null;
        // The request's contact becomes the center's official contact.
        const { institutionName: name, ruc, city, kind, contactEmail: email, contactPhone: phone } = request;
        const institution = await tx.institution.create({ data: { name, ruc, city, kind, email, phone } });
        const id = institution.id;
        // What follows is created in the new institution: the institutionId columns take this value by default.
        await tx.$executeRaw`SELECT set_config('app.institution_id', ${id}, true)`;
        await tx.centerSettings.create({ data: { centerName: name } });
        await tx.subscription.create({ data: Subscription.start(id, now).toSnapshot() });
        await tx.globalSyncVersion.create({ data: {} });
        // Copy of the template's catalogs. ARASAAC pictograms share the bucket image: they are never deleted.
        await tx.$executeRaw`INSERT INTO "Diagnosis" (id, name, active)
          SELECT gen_random_uuid()::text, name, active FROM "Diagnosis" WHERE "institutionId" = ${base}`;
        await tx.$executeRaw`INSERT INTO "Condition" (id, name, active)
          SELECT gen_random_uuid()::text, name, active FROM "Condition" WHERE "institutionId" = ${base}`;
        await tx.avatar.createMany({ data: avatars });
        await tx.$executeRaw`INSERT INTO "Pictogram" (id, "arasaacId", label, "imagePath", "wordType", active)
          SELECT gen_random_uuid()::text, "arasaacId", label, "imagePath", "wordType", active FROM "Pictogram"
          WHERE "institutionId" = ${base} AND "arasaacId" IS NOT NULL`;
        await tx.$executeRaw`INSERT INTO "Category" (id, name, color, "sortOrder", active)
          SELECT gen_random_uuid()::text, name, color, "sortOrder", active FROM "Category" WHERE "institutionId" = ${base}`;
        await tx.$executeRaw`INSERT INTO "CategoryPictogram" ("categoryId", "pictogramId", "sortOrder")
          SELECT nc.id, np.id, cp."sortOrder" FROM "CategoryPictogram" cp
          JOIN "Category" c ON c.id = cp."categoryId" AND c."institutionId" = ${base}
          JOIN "Pictogram" p ON p.id = cp."pictogramId"
          JOIN "Category" nc ON nc."institutionId" = ${id} AND nc.name = c.name
          JOIN "Pictogram" np ON np."institutionId" = ${id} AND np."arasaacId" = p."arasaacId"`;
        await tx.user.create({ data: AuthPrismaMapper.userToPrisma(admin) });
        await tx.institutionRequest.update({ where: { id: request.id }, data: { institutionId: id } });
        return institution;
      }),
    );
  }

  async reject(id: string, reviewerId: string, reason: string, now: Date) {
    const { count } = await asSystem(() =>
      this.prisma.institutionRequest.updateMany({
        where: { id, status: open },
        data: { status: 'REJECTED', reviewedBy: reviewerId, reviewedAt: now, rejectionReason: reason },
      }),
    );
    return count === 1;
  }

  async purgeRejected(reviewedBefore: Date) {
    await asSystem(() => this.prisma.institutionRequest.deleteMany({ where: { status: 'REJECTED', reviewedAt: { lt: reviewedBefore } } }));
  }

  async superAdminEmails() {
    const rows = await asSystem(() =>
      this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', active: true, institutionId: null }, select: { email: true } }),
    );
    return rows.map((r) => r.email);
  }

  async listInstitutions({ search, active }: InstitutionFilter, page: PageRequest) {
    const contains = { contains: search, mode: 'insensitive' } as const;
    const where: Prisma.InstitutionWhereInput = {
      active,
      ...(search ? { OR: [{ name: contains }, { ruc: contains }, { city: contains }] } : {}),
    };
    const [rows, total] = await asSystem(() =>
      Promise.all([
        this.prisma.institution.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: skipOf(page), take: page.limit }),
        this.prisma.institution.count({ where }),
      ]),
    );
    return toPage(rows, total, page);
  }

  findInstitution(id: string) {
    return asSystem(() => this.prisma.institution.findUnique({ where: { id } }));
  }

  async institutionUsage(institutionId: string, since: Date) {
    const [therapists, parents, activePatients, activeDevices, sessionsLast30Days] = await asSystem(() =>
      Promise.all([
        this.prisma.user.count({ where: { institutionId, role: 'THERAPIST', active: true } }),
        this.prisma.user.count({ where: { institutionId, role: 'PARENT', active: true } }),
        this.prisma.patient.count({ where: { institutionId, status: 'ACTIVE' } }),
        this.prisma.device.count({ where: { institutionId, revokedAt: null } }),
        this.prisma.session.count({ where: { institutionId, kind: 'THERAPY', startedAt: { gte: since } } }),
      ]),
    );
    return { therapists, parents, activePatients, activeDevices, sessionsLast30Days };
  }

  listAdmins(institutionId: string) {
    return asSystem(() =>
      this.prisma.user.findMany({
        where: { institutionId, role: 'ADMIN' },
        select: { id: true, name: true, email: true, active: true, mustChangePassword: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  }

  updateInstitution(id: string, changes: InstitutionChanges) {
    return asSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const institution = await tx.institution.update({ where: { id }, data: changes });
        // Panels and PDFs read the center name from its settings: both stay the same name.
        if (changes.name) await tx.centerSettings.updateMany({ where: { institutionId: id }, data: { centerName: changes.name } });
        return institution;
      }),
    );
  }

  async setActive(id: string, active: boolean, reason: string | null) {
    const [institution, users, devices] = await asSystem(() =>
      this.prisma.$transaction([
        this.prisma.institution.update({ where: { id }, data: { active, suspendedReason: active ? null : reason } }),
        this.prisma.user.findMany({ where: { institutionId: id }, select: { id: true } }),
        this.prisma.device.findMany({ where: { institutionId: id }, select: { tokenHash: true } }),
      ]),
    );
    // The next request reads the new state.
    await Promise.all([
      ...users.map((u) => this.cache.del(accountKey(u.id))),
      ...devices.map((d) => this.cache.del(deviceKey(d.tokenHash))),
    ]);
    return institution;
  }

  async createAdmin(institutionId: string, admin: User) {
    try {
      await asSystem(() => this.prisma.user.create({ data: { ...AuthPrismaMapper.userToPrisma(admin), institutionId } }));
    } catch (error) {
      // Two simultaneous sign-ups with the same e-mail: the database decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new EmailTaken();
      throw error;
    }
  }

  async platformStats(contactOverdueBefore: Date, monthAgo: Date) {
    const p = this.prisma;
    const now = new Date();
    const therapy = { kind: 'THERAPY' as const };
    const [pending, inReview, contactOverdue, institutions, therapists, patients, recent, last, activeDevices, oldest, plans, collected] =
      await asSystem(() =>
        Promise.all([
          p.institutionRequest.count({ where: { status: 'PENDING' } }),
          p.institutionRequest.count({ where: { status: 'IN_REVIEW' } }),
          p.institutionRequest.count({ where: { status: 'PENDING', createdAt: { lt: contactOverdueBefore } } }),
          p.institution.findMany({ select: { id: true, name: true, city: true, active: true } }),
          p.user.groupBy({ by: ['institutionId'], where: { role: 'THERAPIST', active: true }, _count: true }),
          p.patient.groupBy({ by: ['institutionId'], where: { status: 'ACTIVE' }, _count: true }),
          p.session.groupBy({ by: ['institutionId'], where: { ...therapy, startedAt: { gte: monthAgo } }, _count: true }),
          p.session.groupBy({ by: ['institutionId'], where: therapy, _max: { startedAt: true } }),
          p.device.count({ where: { revokedAt: null } }),
          p.institutionRequest.findMany({ where: { status: open }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 5 }),
          p.subscription.findMany({ select: { institutionId: true, status: true, graceEndsAt: true, currentPeriodEnd: true } }),
          p.subscriptionPayment.aggregate({
            where: { paidAt: { gte: new Date(now.getTime() - 365 * dayMs) } },
            _sum: { amountCents: true },
          }),
        ]),
      );
    const countIn = (rows: { institutionId: string | null; _count: number }[], id: string) =>
      rows.find((r) => r.institutionId === id)?._count ?? 0;
    const sum = (rows: { _count: number }[]) => rows.reduce((n, r) => n + r._count, 0);
    const active = institutions.filter((i) => i.active).length;
    const planOf = (id: string) => {
      const plan = plans.find((row) => row.institutionId === id);
      return plan ? effectiveStatusOf(plan, now) : null;
    };
    const planStates = plans.map((plan) => effectiveStatusOf(plan, now));
    const planCount = (...wanted: string[]) => planStates.filter((state) => wanted.includes(state)).length;
    // Centers with the most sessions in the last 30 days first.
    const centers = institutions
      .map((institution) => ({
        ...institution,
        therapists: countIn(therapists, institution.id),
        activePatients: countIn(patients, institution.id),
        sessionsLast30Days: countIn(recent, institution.id),
        lastSessionAt: last.find((r) => r.institutionId === institution.id)?._max.startedAt ?? null,
        planStatus: planOf(institution.id),
      }))
      .sort((a, b) => b.sessionsLast30Days - a.sessionsLast30Days || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return {
      requests: { pending, inReview, contactOverdue },
      institutions: { total: institutions.length, active, suspended: institutions.length - active },
      totals: { therapists: sum(therapists), activePatients: sum(patients), activeDevices },
      plans: {
        active: planCount('ACTIVE', 'EXPIRING_SOON'),
        pendingPayment: planCount('PENDING_PAYMENT'),
        overdue: planCount('OVERDUE', 'EXPIRED'),
        canceled: planCount('CANCELED'),
        collectedCentsLastYear: collected._sum.amountCents ?? 0,
      },
      oldestOpenRequests: oldest.map(toRequest),
      centers,
    };
  }
}
