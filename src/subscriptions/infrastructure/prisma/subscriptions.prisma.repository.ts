import { Injectable } from '@nestjs/common';
import { Subscription as SubscriptionRow } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { asSystem, currentInstitution } from '../../../tenancy/tenancy';
import { Payment, Subscription } from '../../domain/entities/subscription.entity';
import { SubscriptionsRepository } from '../../domain/ports/subscriptions.repository';

const toDomain = ({ updatedAt: _, ...row }: SubscriptionRow) => Subscription.reconstitute(row);
const newestFirst = [{ paidAt: 'desc' as const }, { id: 'asc' as const }];

@Injectable()
export class SubscriptionsPrismaRepository extends SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(institutionId: string) {
    const row = await asSystem(() => this.prisma.subscription.findUnique({ where: { institutionId } }));
    return row && toDomain(row);
  }

  async findOwn() {
    const row = await this.prisma.subscription.findUnique({ where: { institutionId: currentInstitution() } });
    return row && toDomain(row);
  }

  async save(subscription: Subscription) {
    const { institutionId, ...data } = subscription.toSnapshot();
    await asSystem(() => this.prisma.subscription.update({ where: { institutionId }, data }));
  }

  async savePayment(subscription: Subscription, payment: Payment) {
    const { institutionId, ...data } = subscription.toSnapshot();
    await asSystem(() =>
      this.prisma.$transaction([
        this.prisma.subscription.update({ where: { institutionId }, data }),
        this.prisma.subscriptionPayment.create({ data: payment }),
      ]),
    );
  }

  async listPayments(institutionId: string, page: PageRequest) {
    const where = { institutionId };
    const [rows, total] = await asSystem(() =>
      Promise.all([
        this.prisma.subscriptionPayment.findMany({ where, orderBy: newestFirst, skip: skipOf(page), take: page.limit }),
        this.prisma.subscriptionPayment.count({ where }),
      ]),
    );
    return toPage(rows as Payment[], total, page);
  }

  async listOwnPayments(page: PageRequest) {
    const [rows, total] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({ orderBy: newestFirst, skip: skipOf(page), take: page.limit }),
      this.prisma.subscriptionPayment.count(),
    ]);
    return toPage(rows as Payment[], total, page);
  }

  async listAllPayments(page: PageRequest) {
    const [rows, total] = await asSystem(() =>
      Promise.all([
        this.prisma.subscriptionPayment.findMany({
          include: { subscription: { select: { institution: { select: { name: true } } } } },
          orderBy: newestFirst,
          skip: skipOf(page),
          take: page.limit,
        }),
        this.prisma.subscriptionPayment.count(),
      ]),
    );
    const items = rows.map(({ subscription, ...payment }) => ({
      ...payment,
      method: payment.method,
      institutionName: subscription.institution.name,
    }));
    return toPage(items, total, page);
  }
}
