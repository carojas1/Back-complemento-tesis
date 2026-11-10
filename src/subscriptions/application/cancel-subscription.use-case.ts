import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { NotificationPublisher } from '../../notifications/domain/ports/notifications.repository';
import { inInstitution } from '../../tenancy/tenancy';
import { SubscriptionNotFound } from '../domain/exceptions/subscriptions.exceptions';
import { SubscriptionsRepository } from '../domain/ports/subscriptions.repository';

// Canceling never blocks a center by itself: the super admin decides and suspends it from institutions.
@Injectable()
export class CancelSubscriptionUseCase {
  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly audit: AuthAuditLog,
    private readonly notify: NotificationPublisher,
  ) {}

  async execute(institutionId: string, actor: { id: string; ip?: string }) {
    const subscription = await this.repo.find(institutionId);
    if (!subscription) throw new SubscriptionNotFound();
    subscription.cancel();
    await this.repo.save(subscription);
    await inInstitution(institutionId, () =>
      this.audit.record({
        action: 'SUBSCRIPTION_CANCEL',
        actorType: 'USER',
        actorId: actor.id,
        entity: 'Subscription',
        entityId: institutionId,
        ip: actor.ip,
      }),
    );
    await this.notify.publish({
      audience: 'INSTITUTION',
      institutionId,
      type: 'SUBSCRIPTION_CANCELED',
      title: 'Plan anual cancelado',
      body: 'El administrador de la plataforma canceló el plan de su centro. Comuníquese con él para restablecerlo.',
      link: '/center/settings',
    });
    return subscription.toView(new Date());
  }
}
