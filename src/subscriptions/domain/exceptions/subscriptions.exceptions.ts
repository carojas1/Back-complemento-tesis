import { DomainException } from '../../../common/exceptions/base.exception';

export class SubscriptionNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'SubscriptionNotFound', 'Este centro no tiene un plan');
  }
}

export class InvalidPaymentAmount extends DomainException {
  constructor(expectedCents: number) {
    super('INVALID', 'InvalidPaymentAmount', `La cuota anual es de ${(expectedCents / 100).toFixed(2)} USD`);
  }
}

export class SubscriptionCanceled extends DomainException {
  constructor() {
    super('CONFLICT', 'SubscriptionCanceled', 'El plan de este centro está cancelado');
  }
}
