import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { RequestAlreadyReviewed, RequestNotFound } from '../domain/exceptions/institutions.exceptions';
import { InstitutionsRepository } from '../domain/ports/institutions.repository';
import { PlatformUseCases } from './platform.use-cases';

// First contact with the center (goal: within 24 hours): PENDING → IN_REVIEW with the call notes.
@Injectable()
export class StartRequestReviewUseCase {
  constructor(
    private readonly repo: InstitutionsRepository,
    private readonly audit: AuthAuditLog,
    private readonly platform: PlatformUseCases,
  ) {}

  async execute({ id, notes, reviewerId, ip }: { id: string; notes: string; reviewerId: string; ip?: string }) {
    if (!(await this.repo.findRequest(id))) throw new RequestNotFound();
    if (!(await this.repo.startReview(id, reviewerId, notes, new Date()))) throw new RequestAlreadyReviewed();
    await this.audit.record({
      action: 'INSTITUTION_REQUEST_REVIEW',
      actorType: 'USER',
      actorId: reviewerId,
      entity: 'InstitutionRequest',
      entityId: id,
      ip,
    });
    return this.platform.getRequest(id, { reviewerId, ip }); // with the contact data: it stays in the audit log
  }
}
