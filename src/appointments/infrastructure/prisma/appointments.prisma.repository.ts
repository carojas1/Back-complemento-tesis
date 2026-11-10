import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { Appointment } from '../../domain/entities/appointment.entity';
import { PatientUnavailable, RoomUnavailable, TherapistUnavailable } from '../../domain/exceptions/appointments.exceptions';
import {
  AppointmentFilter,
  AppointmentRow,
  AppointmentsRepository,
  FutureAppointmentsCanceller,
} from '../../domain/ports/appointments.repository';
import { isTherapistAssigned } from '../../../prisma/patient-access';

const include = {
  patient: { select: { code: true, avatarId: true } },
  therapist: { select: { name: true, specialty: true } },
  room: { select: { name: true } },
} as const;
type Row = Prisma.AppointmentGetPayload<{ include: typeof include }>;

const toDomain = ({ institutionId: _, updatedAt: __, ...row }: Prisma.AppointmentGetPayload<object>) => Appointment.reconstitute(row);
const toRow = ({ patient, therapist, room, ...row }: Row): AppointmentRow =>
  Object.assign(toDomain(row), {
    patientCode: patient.code,
    patientAvatarId: patient.avatarId,
    therapistName: therapist.name,
    therapistSpecialty: therapist.specialty,
    roomName: room?.name ?? null,
  });

// The exclusion constraints catch what two simultaneous requests slip past the overlap check.
function rethrowOverlap(error: unknown): never {
  const text = String(error instanceof Error ? error.message : error);
  if (text.includes('Appointment_therapist_no_overlap')) throw new TherapistUnavailable();
  if (text.includes('Appointment_patient_no_overlap')) throw new PatientUnavailable();
  if (text.includes('Appointment_room_no_overlap')) throw new RoomUnavailable();
  throw error;
}

@Injectable()
export class AppointmentsPrismaRepository extends AppointmentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list({ from, to, therapistId, patientId, status, specialty, roomId }: AppointmentFilter, page: PageRequest) {
    const where: Prisma.AppointmentWhereInput = {
      therapistId,
      patientId,
      status,
      roomId,
      ...(specialty ? { therapist: { specialty } } : {}),
      ...(from || to ? { startsAt: { gte: from, lt: to } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return toPage(rows.map(toRow), total, page);
  }

  async find(id: string) {
    const row = await this.prisma.appointment.findUnique({ where: { id } });
    return row && toDomain(row);
  }

  async findRow(id: string) {
    const row = await this.prisma.appointment.findUnique({ where: { id }, include });
    return row && toRow(row);
  }

  async insert(appointment: Appointment) {
    await this.prisma.appointment.create({ data: appointment.toSnapshot() }).catch(rethrowOverlap);
  }

  async update(appointment: Appointment) {
    const { id, ...data } = appointment.toSnapshot();
    const { count } = await this.prisma.appointment.updateMany({ where: { id, status: 'SCHEDULED' }, data }).catch(rethrowOverlap);
    return count === 1;
  }

  async overlaps({ therapistId, patientId, roomId, startsAt, endsAt, exceptId }: Parameters<AppointmentsRepository['overlaps']>[0]) {
    const base = {
      status: 'SCHEDULED' as const,
      id: exceptId ? { not: exceptId } : undefined,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    };
    const [therapist, patient, room] = await Promise.all([
      this.prisma.appointment.count({ where: { ...base, therapistId } }),
      this.prisma.appointment.count({ where: { ...base, patientId } }),
      roomId ? this.prisma.appointment.count({ where: { ...base, roomId } }) : 0,
    ]);
    return { therapist: therapist > 0, patient: patient > 0, room: room > 0 };
  }

  openingHours() {
    return this.prisma.centerHours.findMany({ select: { weekday: true, opensAt: true, closesAt: true } });
  }

  async isActiveRoom(roomId: string) {
    return (await this.prisma.room.count({ where: { id: roomId, active: true } })) > 0;
  }

  async isActiveTherapist(userId: string) {
    return (await this.prisma.user.count({ where: { id: userId, role: 'THERAPIST', active: true } })) > 0;
  }

  async isActivePatient(patientId: string) {
    return (await this.prisma.patient.count({ where: { id: patientId, status: 'ACTIVE' } })) > 0;
  }

  isAssigned(patientId: string, therapistId: string) {
    return isTherapistAssigned(this.prisma, patientId, therapistId);
  }

  async patientCode(patientId: string) {
    return (await this.prisma.patient.findUnique({ where: { id: patientId }, select: { code: true } }))?.code;
  }
}

@Injectable()
export class FutureAppointmentsPrismaCanceller extends FutureAppointmentsCanceller {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async cancel(where: Prisma.AppointmentWhereInput, now: Date) {
    const { count } = await this.prisma.appointment.updateMany({
      where: { ...where, status: 'SCHEDULED', startsAt: { gte: now } },
      data: { status: 'CANCELED' },
    });
    return count;
  }

  cancelForPatient(patientId: string, now: Date) {
    return this.cancel({ patientId }, now);
  }

  cancelForTherapist(therapistId: string, now: Date) {
    return this.cancel({ therapistId }, now);
  }
}
