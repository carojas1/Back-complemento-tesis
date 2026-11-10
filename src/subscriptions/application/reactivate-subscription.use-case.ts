import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { inInstitution } from '../../tenancy/tenancy';
import { SubscriptionNotFound } from '../domain/exceptions/subscriptions.exceptions';
import { SubscriptionsRepository } from '../domain/ports/subscriptions.repository';

@Injectable()
export class ReactivateSubscriptionUseCase {
  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(institutionId: string, actor: { id: string; ip?: string }) {
    const subscription = await this.repo.find(institutionId);
    if (!subscription) throw new SubscriptionNotFound();
    const now = new Date();
    subscription.reactivate(now);
    await this.repo.save(subscription);
    await inInstitution(institutionId, () =>
      this.audit.record({
        action: 'SUBSCRIPTION_CHANGE',
        actorType: 'USER',
        actorId: actor.id,
        entity: 'Subscription',
        entityId: institutionId,
        ip: actor.ip,
        summary: { reactivated: true },
      }),
    );
    return subscription.toView(now);
  }
}
