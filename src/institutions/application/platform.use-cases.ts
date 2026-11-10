import { Injectable, Logger } from '@nestjs/common';
import { Role, User } from '../../auth/domain/entities/user.entity';
import { AuthAuditLog, AuthMailer } from '../../auth/domain/ports/auth-notifications.ports';
import { PasswordHasher } from '../../auth/domain/ports/security.ports';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { FileStorage } from '../../common/storage/file-storage';
import { NotificationPublisher } from '../../notifications/domain/ports/notifications.repository';
import { inInstitution } from '../../tenancy/tenancy';
// prettier-ignore
import { contactDueAt, generateTemporaryPassword, InstitutionRequest, isContactOverdue, isOpen, RequestStatus } from '../domain/entities/institution-request.entity';
import { InstitutionExists, RequestAlreadyReviewed, RequestNotFound } from '../domain/exceptions/institutions.exceptions';
import { InstitutionFilter, InstitutionsRepository } from '../domain/ports/institutions.repository';

type Actor = { reviewerId: string; ip?: string };

// The promise to contact the center within 24 hours, as the panels show it.
const contactWindow = (request: InstitutionRequest, now = new Date()) => ({
  contactDueAt: contactDueAt(request),
  contactOverdue: isContactOverdue(request, now),
});

// The list does not carry the person's contact data: only the detail does, which is audited.
const summary = (request: InstitutionRequest) => {
  const { id, institutionName, city, kind, approxPatients, status, createdAt, contactedAt, reviewedAt } = request;
  return { id, institutionName, city, kind, approxPatients, status, createdAt, contactedAt, reviewedAt, ...contactWindow(request) };
};

// Super admin /platform/* routes (spec 113 FR-006). They see requests and institutions, never a center's data.
@Injectable()
export class PlatformUseCases {
  private readonly logger = new Logger(PlatformUseCases.name);

  constructor(
    private readonly repo: InstitutionsRepository,
    private readonly hasher: PasswordHasher,
    private readonly mailer: AuthMailer,
    private readonly audit: AuthAuditLog,
    private readonly storage: FileStorage,
    private readonly notify: NotificationPublisher,
  ) {}

  // ponytail: old rejected requests are deleted when listing; a cron if the panel goes months unopened.
  async listRequests(status: RequestStatus | undefined, page: PageRequest) {
    await this.repo.purgeRejected(new Date(Date.now() - 180 * 24 * 60 * 60_000));
    return mapPage(await this.repo.listRequests(status, page), summary);
  }

  // Fetches a person's contact data: it is recorded in the audit.
  async getRequest(id: string, { reviewerId, ip }: Actor) {
    const request = await this.repo.findRequest(id);
    if (!request) throw new RequestNotFound();
    await this.audit.record({
      action: 'INSTITUTION_REQUEST_READ',
      actorType: 'USER',
      actorId: reviewerId,
      entity: 'InstitutionRequest',
      entityId: id,
      ip,
    });
    return { ...request, ...contactWindow(request) };
  }

  // FR-007: the institution is left ready with its first admin. The temporary password goes by e-mail and in this single
  // response (the tablet app shows it once to the super admin); only its hash is stored.
  async approve(id: string, { reviewerId, ip }: Actor) {
    const request = await this.repo.findRequest(id);
    if (!request) throw new RequestNotFound();
    if (!isOpen(request)) throw new RequestAlreadyReviewed();
    if (await this.repo.institutionWithRuc(request.ruc)) throw new InstitutionExists();

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.hasher.hash(temporaryPassword);
    const admin = User.create({
      name: request.contactName,
      email: request.contactEmail,
      passwordHash,
      role: Role.ADMIN,
      mustChangePassword: true,
    });
    const institution = await this.repo.approve(request, admin, await this.copyAvatars(), reviewerId, new Date());
    if (!institution) throw new RequestAlreadyReviewed();

    const summary = { institutionId: institution.id, institutionName: institution.name };
    await this.audit.record({
      action: 'INSTITUTION_APPROVE',
      actorType: 'USER',
      actorId: reviewerId,
      entity: 'InstitutionRequest',
      entityId: id,
      ip,
      summary,
    });
    await inInstitution(institution.id, () =>
      this.audit.record({
        action: 'USER_CREATE',
        actorType: 'USER',
        actorId: reviewerId,
        userId: admin.id,
        ip,
        summary: { role: Role.ADMIN, source: 'platform' },
      }),
    );
    // If the email fails, the admin signs in through "forgot my password" (the account exists). Not awaited: the one-time
    // password in this response must not depend on the mail server.
    void this.mailer
      .sendInstitutionWelcome({ email: admin.email, name: admin.name }, institution.name, temporaryPassword)
      .catch((e: unknown) => this.logger.warn(`Could not send the welcome e-mail for ${institution.id}: ${String(e)}`));
    await this.notify.publish({
      audience: 'INSTITUTION',
      institutionId: institution.id,
      type: 'INSTITUTION_APPROVED',
      title: `Bienvenidos a Necon, ${institution.name}`,
      body: 'Su centro está listo. Cree las cuentas de sus terapeutas y registre sus tabletas.',
      link: '/center/team',
    });
    return { institution, admin: { id: admin.id, email: admin.email, temporaryPassword } };
  }

  // Each image gets its own copy: deleting an avatar in one institution does not leave the other without an image.
  // ponytail: if the approval fails afterwards, the copies are left loose in the bucket.
  private async copyAvatars() {
    const types: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' };
    return Promise.all(
      (await this.repo.templateAvatars()).map(async (avatar) => {
        const ext = avatar.imagePath.split('.').pop() ?? 'png';
        const imagePath = `avatars/${crypto.randomUUID()}.${ext}`;
        await this.storage.put(imagePath, await this.storage.get(avatar.imagePath), types[ext] ?? 'application/octet-stream');
        return { ...avatar, imagePath };
      }),
    );
  }

  async reject(id: string, reason: string, { reviewerId, ip }: Actor) {
    if (!(await this.repo.findRequest(id))) throw new RequestNotFound();
    if (!(await this.repo.reject(id, reviewerId, reason, new Date()))) throw new RequestAlreadyReviewed();
    await this.audit.record({
      action: 'INSTITUTION_REJECT',
      actorType: 'USER',
      actorId: reviewerId,
      entity: 'InstitutionRequest',
      entityId: id,
      ip,
      summary: { reason },
    });
  }

  listInstitutions(filter: InstitutionFilter, page: PageRequest) {
    return this.repo.listInstitutions(filter, page);
  }
}
