import { Page, PageRequest } from '../../../common/pagination/page';
import { Payment, Subscription } from '../entities/subscription.entity';

export interface PaymentRow extends Payment {
  institutionName: string;
}

// The platform side (super admin) runs as table owner; the center side reads only its own row under RLS.
export abstract class SubscriptionsRepository {
  abstract find(institutionId: string): Promise<Subscription | null>;
  abstract findOwn(): Promise<Subscription | null>;
  abstract save(subscription: Subscription): Promise<void>;
  // The payment and the new period, in one transaction.
  abstract savePayment(subscription: Subscription, payment: Payment): Promise<void>;
  abstract listPayments(institutionId: string, page: PageRequest): Promise<Page<Payment>>;
  abstract listOwnPayments(page: PageRequest): Promise<Page<Payment>>;
  abstract listAllPayments(page: PageRequest): Promise<Page<PaymentRow>>;
}
