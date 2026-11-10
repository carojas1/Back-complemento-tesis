import { Injectable } from '@nestjs/common';
import { PageRequest } from '../../common/pagination/page';
import { SubscriptionsRepository } from '../domain/ports/subscriptions.repository';

@Injectable()
export class ListPaymentsUseCase {
  constructor(private readonly repo: SubscriptionsRepository) {}

  ofCenter(institutionId: string, page: PageRequest) {
    return this.repo.listPayments(institutionId, page);
  }

  own(page: PageRequest) {
    return this.repo.listOwnPayments(page);
  }

  all(page: PageRequest) {
    return this.repo.listAllPayments(page);
  }
}
