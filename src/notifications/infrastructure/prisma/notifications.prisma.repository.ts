import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRequest, skipOf, toPage } from '../../../common/pagination/page';
import { PrismaService } from '../../../prisma/prisma.service';
import { asSystem } from '../../../tenancy/tenancy';
import { NewNotification, Notification, NotificationReader } from '../../domain/entities/notification.entity';
import { NotificationPublisher, NotificationsRepository } from '../../domain/ports/notifications.repository';

const whereOf = (reader: NotificationReader): Prisma.NotificationWhereInput =>
  reader.audience === 'PLATFORM'
    ? { audience: 'PLATFORM', institutionId: null }
    : { audience: 'INSTITUTION', institutionId: reader.institutionId };

const toDomain = (row: Prisma.NotificationGetPayload<object>) => row as Notification;

@Injectable()
export class NotificationsPrismaRepository extends NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(reader: NotificationReader, unreadOnly: boolean, page: PageRequest) {
    const where = { ...whereOf(reader), ...(unreadOnly ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: skipOf(page), take: page.limit }),
      this.prisma.notification.count({ where }),
    ]);
    return toPage(rows.map(toDomain), total, page);
  }

  countUnread(reader: NotificationReader) {
    return this.prisma.notification.count({ where: { ...whereOf(reader), readAt: null } });
  }

  async markRead(reader: NotificationReader, id: string, now: Date) {
    const exists = await this.prisma.notification.count({ where: { ...whereOf(reader), id } });
    if (!exists) return false;
    await this.prisma.notification.updateMany({ where: { ...whereOf(reader), id, readAt: null }, data: { readAt: now } });
    return true;
  }

  async markAllRead(reader: NotificationReader, now: Date) {
    const { count } = await this.prisma.notification.updateMany({ where: { ...whereOf(reader), readAt: null }, data: { readAt: now } });
    return count;
  }
}

// Inserts as table owner (the API role has no INSERT on Notification). If it fails, the action that caused it goes on:
// it stays in the log.
@Injectable()
export class NotificationPrismaPublisher extends NotificationPublisher {
  private readonly logger = new Logger(NotificationPrismaPublisher.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async publish(notification: NewNotification) {
    const { type, title, body, link, audience } = notification;
    const institutionId = notification.audience === 'INSTITUTION' ? notification.institutionId : null;
    try {
      await asSystem(() => this.prisma.notification.create({ data: { audience, institutionId, type, title, body, link } }));
    } catch (error) {
      this.logger.error(`Could not publish notification ${type}`, (error as Error).stack);
    }
  }
}
