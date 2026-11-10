import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { inInstitution } from '../../tenancy/tenancy';
import { InstitutionChanges } from '../domain/entities/institution-request.entity';
import { InstitutionNotFound } from '../domain/exceptions/institutions.exceptions';
import { InstitutionsRepository } from '../domain/ports/institutions.repository';
import { GetInstitutionUseCase } from './get-institution.use-case';

// The super admin corrects a center's profile and sets its limits of specialists and tablets (null = no limit).
@Injectable()
export class UpdateInstitutionUseCase {
  constructor(
    private readonly repo: InstitutionsRepository,
    private readonly audit: AuthAuditLog,
    private readonly getInstitution: GetInstitutionUseCase,
  ) {}

  async execute({ id, changes, actorId, ip }: { id: string; changes: InstitutionChanges; actorId: string; ip?: string }) {
    if (!(await this.repo.findInstitution(id))) throw new InstitutionNotFound();
    await this.repo.updateInstitution(id, changes);
    // In the center's own audit log: its admin sees who changed the center.
    await inInstitution(id, () =>
      this.audit.record({
        action: 'INSTITUTION_UPDATE',
        actorType: 'USER',
        actorId,
        entity: 'Institution',
        entityId: id,
        ip,
        summary: { fields: Object.keys(changes) },
      }),
    );
    return this.getInstitution.execute(id);
  }
}
