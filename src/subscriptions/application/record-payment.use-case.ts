import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { NotificationPublisher } from '../../notifications/domain/ports/notifications.repository';
import { inInstitution } from '../../tenancy/tenancy';
import { PaymentMethod } from '../domain/entities/subscription.entity';
import { InvalidPaymentAmount, SubscriptionCanceled, SubscriptionNotFound } from '../domain/exceptions/subscriptions.exceptions';
import { SubscriptionsRepository } from '../domain/ports/subscriptions.repository';

const usd = (cents: number) => `${(cents / 100).toFixed(2)} USD`;

// The fee is fixed per center: a different amount is a typing mistake, not a discount.
@Injectable()
export class RecordPaymentUseCase {
  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly audit: AuthAuditLog,
    private readonly notify: NotificationPublisher,
  ) {}

  async execute(
    institutionId: string,
    input: { amountCents: number; method: PaymentMethod; reference?: string; paidAt?: Date },
    actor: { id: string; ip?: string },
  ) {
    const subscription = await this.repo.find(institutionId);
    if (!subscription) throw new SubscriptionNotFound();
    if (subscription.status === 'CANCELED') throw new SubscriptionCanceled();
    if (input.amountCents !== subscription.priceCents) throw new InvalidPaymentAmount(subscription.priceCents);

    const payment = subscription.recordPayment({
      amountCents: input.amountCents,
      method: input.method,
      reference: input.reference ?? null,
      paidAt: input.paidAt ?? new Date(),
      recordedBy: actor.id,
    });
    await this.repo.savePayment(subscription, payment);
    await inInstitution(institutionId, () =>
      this.audit.record({
        action: 'SUBSCRIPTION_PAYMENT',
        actorType: 'USER',
        actorId: actor.id,
        entity: 'Subscription',
        entityId: institutionId,
        ip: actor.ip,
        summary: { paymentId: payment.id, amountCents: payment.amountCents, periodEnd: payment.periodEnd },
      }),
    );
    await this.notify.publish({
      audience: 'INSTITUTION',
      institutionId,
      type: 'SUBSCRIPTION_PAYMENT_RECORDED',
      title: 'Plan anual renovado',
      body: `Registramos su pago de ${usd(payment.amountCents)}. Su plan está activo hasta el ${payment.periodEnd.toISOString().slice(0, 10)}.`,
      link: '/center/settings',
    });
    return { subscription: subscription.toView(new Date()), payment };
  }
}
