import { Injectable, Logger } from '@nestjs/common';
import { AuthAuditLog, AuthMailer } from '../../auth/domain/ports/auth-notifications.ports';
import { NotificationPublisher } from '../../notifications/domain/ports/notifications.repository';
import { contactWindowHours, privacyNoticeVersion } from '../domain/entities/institution-request.entity';
import { InstitutionExists, RequestAlreadyPending } from '../domain/exceptions/institutions.exceptions';
import { InstitutionsRepository, NewRequest } from '../domain/ports/institutions.repository';

// "Request an account" from the app's first screen or from the web (spec 113 FR-005): it stays pending for the super
// admin, who receives a notification and an e-mail; the requester receives confirmation that they will be contacted within 24 hours.
@Injectable()
export class RequestInstitutionUseCase {
  private readonly logger = new Logger(RequestInstitutionUseCase.name);

  constructor(
    private readonly repo: InstitutionsRepository,
    private readonly audit: AuthAuditLog,
    private readonly mailer: AuthMailer,
    private readonly notify: NotificationPublisher,
  ) {}

  async execute(input: Omit<NewRequest, 'privacyVersion' | 'privacyAcceptedAt'>) {
    if (await this.repo.institutionWithRuc(input.ruc)) throw new InstitutionExists();
    if (await this.repo.pendingWithRuc(input.ruc)) throw new RequestAlreadyPending();
    const request = await this.repo.createRequest({ ...input, privacyVersion: privacyNoticeVersion, privacyAcceptedAt: new Date() });
    await this.audit.record({
      action: 'INSTITUTION_REQUEST_CREATE',
      actorType: 'SYSTEM',
      entity: 'InstitutionRequest',
      entityId: request.id,
      ip: input.ip,
      summary: { institutionName: request.institutionName },
    });

    await this.notify.publish({
      audience: 'PLATFORM',
      type: 'INSTITUTION_REQUEST_CREATED',
      title: `Nueva solicitud de centro: ${request.institutionName}`,
      body: `${request.institutionName} (${request.city}) pidió una cuenta. Comuníquese con el centro dentro de ${contactWindowHours} horas.`,
      link: `/platform/requests/${request.id}`,
    });
    // If an e-mail fails, the request is not lost: it is already saved and announced in the panel.
    const warn = (e: unknown) => this.logger.warn(`Request ${request.id}: could not send the e-mail: ${String(e)}`);
    // Not awaited: the applicant gets the answer now even if the mail server is slow.
    void this.mailer.sendRequestReceived({ email: request.contactEmail, name: request.contactName }, request.institutionName).catch(warn);
    void this.repo
      .superAdminEmails()
      .then((emails) => this.mailer.sendNewRequestAlert(emails, request.institutionName, request.id))
      .catch(warn);
    return { id: request.id, status: request.status, createdAt: request.createdAt };
  }
}
