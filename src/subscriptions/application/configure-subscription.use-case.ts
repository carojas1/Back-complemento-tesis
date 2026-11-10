import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { inInstitution } from '../../tenancy/tenancy';
import { SubscriptionNotFound } from '../domain/exceptions/subscriptions.exceptions';
import { SubscriptionsRepository } from '../domain/ports/subscriptions.repository';

// The super admin sets the annual fee of a center.
@Injectable()
export class ConfigureSubscriptionUseCase {
  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(institutionId: string, priceCents: number, actor: { id: string; ip?: string }) {
    const subscription = await this.repo.find(institutionId);
    if (!subscription) throw new SubscriptionNotFound();
    subscription.setPrice(priceCents);
    await this.repo.save(subscription);
    await inInstitution(institutionId, () =>
      this.audit.record({
        action: 'SUBSCRIPTION_CHANGE',
        actorType: 'USER',
        actorId: actor.id,
        entity: 'Subscription',
        entityId: institutionId,
        ip: actor.ip,
        summary: { priceCents },
      }),
    );
    return subscription.toView(new Date());
  }
}
