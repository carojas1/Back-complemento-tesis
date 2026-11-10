import { Module } from '@nestjs/common';
import { CountUnreadNotificationsUseCase } from './application/count-unread-notifications.use-case';
import { ListNotificationsUseCase } from './application/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from './application/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from './application/mark-notification-read.use-case';
import { NotificationPublisher, NotificationsRepository } from './domain/ports/notifications.repository';
import { NotificationsController } from './infrastructure/http/notifications.controller';
import { NotificationPrismaPublisher, NotificationsPrismaRepository } from './infrastructure/prisma/notifications.prisma.repository';

// Notifications of the admin panels. Exports the publisher for institutions and subscriptions.
@Module({
  controllers: [NotificationsController],
  providers: [
    { provide: NotificationsRepository, useClass: NotificationsPrismaRepository },
    { provide: NotificationPublisher, useClass: NotificationPrismaPublisher },
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    MarkNotificationReadUseCase,
    MarkAllNotificationsReadUseCase,
  ],
  exports: [NotificationPublisher],
})
export class NotificationsModule {}
