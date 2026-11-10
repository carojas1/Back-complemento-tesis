import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { AuthRepository } from '../../auth/domain/ports/auth.repository';
import { NotAssignable, UnknownPatients, UserNotFound } from '../domain/exceptions/users.exceptions';
import { AssignedPatient, UsersRepository } from '../domain/ports/users.repository';

// Replaces the complete list (PUT). The therapist sees only these patients; the guardian, only their children (spec 112).
@Injectable()
export class ReplaceAssignedPatientsUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { id: string; patientIds: string[]; actorId: string; ip?: string }): Promise<AssignedPatient[]> {
    const user = await this.auth.findUserById(input.id);
    if (!user) throw new UserNotFound();
    if (user.role === Role.ADMIN) throw new NotAssignable();

    const ids = [...new Set(input.patientIds)];
    const patients = await this.users.findPatients(ids);
    if (patients.length !== ids.length) throw new UnknownPatients(ids.length - patients.length);

    const before = await this.users.findAssignedPatients(user);
    await this.users.replaceAssignedPatients(user, ids);

    const codes = (list: AssignedPatient[], other: AssignedPatient[]) =>
      list.filter((p) => !other.some((o) => o.id === p.id)).map((p) => p.code);
    await this.audit.record({
      action: user.role === Role.PARENT ? 'CHILDREN_ASSIGNED' : 'PATIENTS_ASSIGNED',
      actorType: 'USER',
      actorId: input.actorId,
      userId: user.id,
      ip: input.ip,
      summary: { added: codes(patients, before), removed: codes(before, patients) },
    });
    return patients.sort((a, b) => a.code.localeCompare(b.code));
  }
}
