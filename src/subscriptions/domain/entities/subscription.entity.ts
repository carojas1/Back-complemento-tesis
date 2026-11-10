// Annual plan of a center: USD 2.00 per year by default, paid outside the platform and recorded by the super admin. Each payment
// extends the period by one year from the end of the current one (or from the payment date if it already ended).
export const annualPriceCents = 200;
const planCurrency = 'USD';
const gracePeriodDays = 30;
const expiringSoonDays = 30;
const day = 24 * 60 * 60_000;

export type SubscriptionStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'CANCELED';
// What the panels show: the stored status plus what the dates say.
export type EffectiveStatus = 'PENDING_PAYMENT' | 'OVERDUE' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELED';
export const paymentMethods = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export interface SubscriptionProps {
  institutionId: string;
  plan: string;
  priceCents: number;
  currency: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  createdAt: Date;
}

export interface Payment {
  id: string;
  institutionId: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  paidAt: Date;
  periodStart: Date;
  periodEnd: Date;
  recordedBy: string;
  createdAt: Date;
}

const addYear = (date: Date) => {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
};

// Shared with the platform dashboard, which reads plain rows.
export function effectiveStatusOf(
  plan: Pick<SubscriptionProps, 'status' | 'graceEndsAt' | 'currentPeriodEnd'>,
  now: Date,
): EffectiveStatus {
  if (plan.status === 'CANCELED') return 'CANCELED';
  if (plan.status === 'PENDING_PAYMENT') return plan.graceEndsAt && plan.graceEndsAt < now ? 'OVERDUE' : 'PENDING_PAYMENT';
  if (!plan.currentPeriodEnd || plan.currentPeriodEnd < now) return 'EXPIRED';
  return plan.currentPeriodEnd.getTime() - now.getTime() <= expiringSoonDays * day ? 'EXPIRING_SOON' : 'ACTIVE';
}

export interface Subscription extends Readonly<SubscriptionProps> {}
export class Subscription {
  private constructor(props: SubscriptionProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: SubscriptionProps) {
    return new Subscription(props);
  }

  // A newly approved center: it can work during the grace period while it pays the first year.
  static start(institutionId: string, now: Date) {
    return new Subscription({
      institutionId,
      plan: 'ANNUAL',
      priceCents: annualPriceCents,
      currency: planCurrency,
      status: 'PENDING_PAYMENT',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceEndsAt: new Date(now.getTime() + gracePeriodDays * day),
      createdAt: now,
    });
  }

  daysLeft(now: Date) {
    const end = this.status === 'PENDING_PAYMENT' ? this.graceEndsAt : this.currentPeriodEnd;
    return end ? Math.ceil((end.getTime() - now.getTime()) / day) : null;
  }

  // One payment = one year. Paying early stacks the new year after the current one.
  recordPayment(input: {
    amountCents: number;
    method: PaymentMethod;
    reference: string | null;
    paidAt: Date;
    recordedBy: string;
  }): Payment {
    const running =
      this.status === 'ACTIVE' && this.currentPeriodEnd && this.currentPeriodEnd > input.paidAt ? this.currentPeriodEnd : null;
    const periodStart = running ?? input.paidAt;
    const periodEnd = addYear(periodStart);
    Object.assign(this, {
      status: 'ACTIVE',
      currentPeriodStart: running ? this.currentPeriodStart : periodStart,
      currentPeriodEnd: periodEnd,
      graceEndsAt: null,
    });
    return {
      id: crypto.randomUUID(),
      institutionId: this.institutionId,
      amountCents: input.amountCents,
      currency: this.currency,
      method: input.method,
      reference: input.reference,
      paidAt: input.paidAt,
      periodStart,
      periodEnd,
      recordedBy: input.recordedBy,
      createdAt: new Date(),
    };
  }

  setPrice(priceCents: number) {
    Object.assign(this, { priceCents });
  }

  cancel() {
    Object.assign(this, { status: 'CANCELED' });
  }

  // Back to its paid period if it still runs; otherwise a new grace period to pay.
  reactivate(now: Date) {
    if (this.currentPeriodEnd && this.currentPeriodEnd > now) Object.assign(this, { status: 'ACTIVE' });
    else Object.assign(this, { status: 'PENDING_PAYMENT', graceEndsAt: new Date(now.getTime() + gracePeriodDays * day) });
  }

  toSnapshot(): SubscriptionProps {
    return { ...this };
  }

  toView(now: Date) {
    return { ...this.toSnapshot(), effectiveStatus: effectiveStatusOf(this, now), daysLeft: this.daysLeft(now) };
  }
}
