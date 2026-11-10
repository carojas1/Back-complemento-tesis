import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { NotificationPublisher } from '../../notifications/domain/ports/notifications.repository';
import { baseInstitutionId, inInstitution } from '../../tenancy/tenancy';
import { InstitutionNotFound, TemplateInstitutionLocked } from '../domain/exceptions/institutions.exceptions';
import { InstitutionsRepository } from '../domain/ports/institutions.repository';
import { GetInstitutionUseCase } from './get-institution.use-case';

// Suspended: nobody from the center signs in and its tablets stop syncing from the next request. Nothing is deleted.
@Injectable()
export class SetInstitutionStatusUseCase {
  constructor(
    private readonly repo: InstitutionsRepository,
    private readonly audit: AuthAuditLog,
    private readonly notify: NotificationPublisher,
    private readonly getInstitution: GetInstitutionUseCase,
  ) {}

  async execute({ id, active, reason, actorId, ip }: { id: string; active: boolean; reason: string | null; actorId: string; ip?: string }) {
    if (!(await this.repo.findInstitution(id))) throw new InstitutionNotFound();
    if (!active && id === baseInstitutionId) throw new TemplateInstitutionLocked();
    await this.repo.setActive(id, active, reason);
    // In the center's own audit log: its admin sees who suspended it and why.
    await inInstitution(id, () =>
      this.audit.record({
        action: active ? 'INSTITUTION_REACTIVATE' : 'INSTITUTION_SUSPEND',
        actorType: 'USER',
        actorId,
        entity: 'Institution',
        entityId: id,
        ip,
        summary: reason ? { reason } : undefined,
      }),
    );
    if (active)
      await this.notify.publish({
        audience: 'INSTITUTION',
        institutionId: id,
        type: 'INSTITUTION_REACTIVATED',
        title: 'Su centro está activo de nuevo',
        body: 'El administrador de la plataforma reactivó su centro. Todo el equipo puede volver a entrar.',
      });
    return this.getInstitution.execute(id);
  }
}
