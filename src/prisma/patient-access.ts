import type { PrismaService } from './prisma.service';

// Whether this specialist attends this patient. Every module that opens clinical data asks it the same way, under the caller's center (RLS).
export async function isTherapistAssigned(prisma: Pick<PrismaService, 'therapistPatient'>, patientId: string, therapistId: string) {
  return (await prisma.therapistPatient.count({ where: { patientId, therapistId } })) > 0;
}
