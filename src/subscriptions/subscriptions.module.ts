import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { NotificationsModule } from '../notifications/notifications.module';
import { CancelSubscriptionUseCase } from './application/cancel-subscription.use-case';
import { ConfigureSubscriptionUseCase } from './application/configure-subscription.use-case';
import { GetSubscriptionUseCase } from './application/get-subscription.use-case';
import { ListPaymentsUseCase } from './application/list-payments.use-case';
import { ReactivateSubscriptionUseCase } from './application/reactivate-subscription.use-case';
import { RecordPaymentUseCase } from './application/record-payment.use-case';
import { SubscriptionsRepository } from './domain/ports/subscriptions.repository';
import { CenterSubscriptionController, PlatformSubscriptionsController } from './infrastructure/http/subscriptions.controller';
import { SubscriptionsPrismaRepository } from './infrastructure/prisma/subscriptions.prisma.repository';

// Annual plan of each center (USD 2.00 per year by default), paid outside the platform and recorded by the super admin.
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PlatformSubscriptionsController, CenterSubscriptionController],
  providers: [
    { provide: SubscriptionsRepository, useClass: SubscriptionsPrismaRepository },
    GetSubscriptionUseCase,
    ListPaymentsUseCase,
    RecordPaymentUseCase,
    ConfigureSubscriptionUseCase,
    CancelSubscriptionUseCase,
    ReactivateSubscriptionUseCase,
  ],
})
export class SubscriptionsModule {}
