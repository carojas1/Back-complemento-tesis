import { Injectable } from '@nestjs/common';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { FamilyRead } from '../../domain/ports/family.read';

const child = { id: true, code: true, firstNames: true, lastNames: true, avatar: { select: { imagePath: true } } } as const;

@Injectable()
export class FamilyPrismaRead extends FamilyRead {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isLinked(patientId: string, guardianId: string) {
    return (await this.prisma.guardianPatient.count({ where: { patientId, guardianId } })) > 0;
  }

  async children(guardianId: string, page: PageRequest) {
    const where = { guardians: { some: { guardianId } } };
    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({ where, select: child, orderBy: { code: 'asc' }, skip: skipOf(page), take: page.limit }),
      this.prisma.patient.count({ where }),
    ]);
    return toPage(
      rows.map(({ avatar, ...row }) => ({ ...row, avatarPath: avatar.imagePath })),
      total,
      page,
    );
  }

  async child(patientId: string) {
    const row = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        ...child,
        birthDate: true,
        status: true,
        diagnosis: { select: { name: true } },
        therapists: { select: { therapist: { select: { name: true } } }, orderBy: { assignedAt: 'asc' } },
      },
    });
    if (!row) return null;
    const { avatar, diagnosis, therapists, ...rest } = row;
    return {
      ...rest,
      avatarPath: avatar.imagePath,
      diagnosis: diagnosis?.name ?? null,
      therapists: therapists.map((t) => t.therapist.name),
    };
  }

  async sharedNotes(patientId: string, page: PageRequest) {
    const where = { patientId, sharedWithFamily: true };
    const [rows, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        select: { id: true, text: true, createdAt: true, sessionId: true, author: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.note.count({ where }),
    ]);
    return toPage(
      rows.map(({ author, ...row }) => ({ ...row, authorName: author.name })),
      total,
      page,
    );
  }
}
