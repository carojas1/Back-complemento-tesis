import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { Injectable } from '@nestjs/common';
import { isOpen } from '../domain/entities/institution-request.entity';
import { RequestAlreadyReviewed, RequestNotFound } from '../domain/exceptions/institutions.exceptions';
import { InstitutionsRepository } from '../domain/ports/institutions.repository';
import { PlatformUseCases } from './platform.use-cases';

// Notes of follow-up calls while the request stays open (PENDING or IN_REVIEW). They replace the previous ones.
@Injectable()
export class SaveRequestNotesUseCase {
  constructor(
    private readonly repo: InstitutionsRepository,
    private readonly platform: PlatformUseCases,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute({ id, notes, reviewerId, ip }: { id: string; notes: string; reviewerId: string; ip?: string }) {
    const request = await this.repo.findRequest(id);
    if (!request) throw new RequestNotFound();
    if (!isOpen(request) || !(await this.repo.saveReviewNotes(id, notes))) throw new RequestAlreadyReviewed();
    await this.audit.record({
      action: 'INSTITUTION_REQUEST_REVIEW',
      actorType: 'USER',
      actorId: reviewerId,
      entity: 'InstitutionRequest',
      entityId: id,
      ip,
    });
    return this.platform.getRequest(id, { reviewerId, ip });
  }
}
