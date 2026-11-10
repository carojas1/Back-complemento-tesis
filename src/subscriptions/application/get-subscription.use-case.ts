import { Injectable } from '@nestjs/common';
import { SubscriptionNotFound } from '../domain/exceptions/subscriptions.exceptions';
import { SubscriptionsRepository } from '../domain/ports/subscriptions.repository';

// Plan of any center (super admin), or of the center of the request (center admin).
@Injectable()
export class GetSubscriptionUseCase {
  constructor(private readonly repo: SubscriptionsRepository) {}

  async execute(institutionId?: string) {
    const subscription = institutionId ? await this.repo.find(institutionId) : await this.repo.findOwn();
    if (!subscription) throw new SubscriptionNotFound();
    return subscription.toView(new Date());
  }
}
