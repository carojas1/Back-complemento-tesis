import { Injectable, Logger } from '@nestjs/common';
import { normalizeEmail, Role, User } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog, AuthMailer } from '../../auth/domain/ports/auth-notifications.ports';
import { PasswordHasher } from '../../auth/domain/ports/security.ports';
import { inInstitution } from '../../tenancy/tenancy';
import { generateTemporaryPassword } from '../domain/entities/institution-request.entity';
import { InstitutionNotFound } from '../domain/exceptions/institutions.exceptions';
import { InstitutionsRepository } from '../domain/ports/institutions.repository';

// Another admin for a center (the first comes from the approved request). The temporary password goes by email and in this
// single response (the panel shows it once); only its hash is stored.
@Injectable()
export class CreateInstitutionAdminUseCase {
  private readonly logger = new Logger(CreateInstitutionAdminUseCase.name);

  constructor(
    private readonly repo: InstitutionsRepository,
    private readonly hasher: PasswordHasher,
    private readonly mailer: AuthMailer,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { institutionId: string; name: string; email: string; actorId: string; ip?: string }) {
    const institution = await this.repo.findInstitution(input.institutionId);
    if (!institution) throw new InstitutionNotFound();
    const temporaryPassword = generateTemporaryPassword();
    const admin = User.create({
      name: input.name,
      email: normalizeEmail(input.email),
      passwordHash: await this.hasher.hash(temporaryPassword),
      role: Role.ADMIN,
      mustChangePassword: true,
    });
    await this.repo.createAdmin(input.institutionId, admin);
    await inInstitution(input.institutionId, () =>
      this.audit.record({
        action: 'USER_CREATE',
        actorType: 'USER',
        actorId: input.actorId,
        userId: admin.id,
        ip: input.ip,
        summary: { role: Role.ADMIN, source: 'platform' },
      }),
    );
    // If the email fails, the admin signs in through "forgot my password" (the account exists).
    await this.mailer
      .sendInstitutionWelcome({ email: admin.email, name: admin.name }, institution.name, temporaryPassword)
      .catch((e: unknown) => this.logger.warn(`Could not send the welcome e-mail to admin ${admin.id}: ${String(e)}`));
    const { id, name, email, active, createdAt } = admin;
    return { id, name, email, active, mustChangePassword: true, createdAt, temporaryPassword };
  }
}
