import { Injectable } from '@nestjs/common';
import { AuthPrismaMapper } from '../../../auth/infrastructure/prisma/auth.prisma.mapper';
import { Role } from '../../../auth/domain/entities/user.entity';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { Assignee, UserFilter, UsersRepository } from '../../domain/ports/users.repository';

const patientSummary = { id: true, code: true, avatarId: true } as const;

// Patients of a therapist or children of a guardian (spec 112).
const assignedTo = ({ id, role }: Assignee) =>
  role === Role.PARENT ? { guardians: { some: { guardianId: id } } } : { therapists: { some: { therapistId: id } } };

@Injectable()
export class UsersPrismaRepository extends UsersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(filter: UserFilter, page: PageRequest) {
    const where = { role: filter.role, active: filter.active };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: skipOf(page), take: page.limit }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(
      rows.map((raw) => AuthPrismaMapper.userToDomain(raw)),
      total,
      page,
    );
  }

  countActiveAdmins() {
    return this.prisma.user.count({ where: { role: 'ADMIN', active: true } });
  }

  async listAssignedPatients(user: Assignee, page: PageRequest) {
    const where = assignedTo(user);
    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({ where, select: patientSummary, orderBy: { code: 'asc' }, skip: skipOf(page), take: page.limit }),
      this.prisma.patient.count({ where }),
    ]);
    return toPage(items, total, page);
  }

  findAssignedPatients(user: Assignee) {
    return this.prisma.patient.findMany({ where: assignedTo(user), select: patientSummary, orderBy: { code: 'asc' } });
  }

  findPatients(ids: string[]) {
    return this.prisma.patient.findMany({ where: { id: { in: ids } }, select: patientSummary });
  }

  async replaceAssignedPatients(user: Assignee, patientIds: string[]) {
    if (user.role === Role.PARENT) {
      const guardianId = user.id;
      await this.prisma.$transaction([
        this.prisma.guardianPatient.deleteMany({ where: { guardianId, patientId: { notIn: patientIds } } }),
        this.prisma.guardianPatient.createMany({ data: patientIds.map((patientId) => ({ guardianId, patientId })), skipDuplicates: true }),
      ]);
      return;
    }
    const therapistId = user.id;
    await this.prisma.$transaction([
      this.prisma.therapistPatient.deleteMany({ where: { therapistId, patientId: { notIn: patientIds } } }),
      this.prisma.therapistPatient.createMany({ data: patientIds.map((patientId) => ({ therapistId, patientId })), skipDuplicates: true }),
    ]);
  }
}
