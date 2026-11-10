import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { readerOf } from '../domain/entities/notification.entity';
import { NotificationNotFound } from '../domain/exceptions/notifications.exceptions';
import { NotificationsRepository } from '../domain/ports/notifications.repository';

// Marks one notification of the reader's inbox as read; one from another inbox answers that it does not exist.
@Injectable()
export class MarkNotificationReadUseCase {
  constructor(private readonly repo: NotificationsRepository) {}

  async execute(user: { role: Role; institutionId: string | null }, id: string) {
    if (!(await this.repo.markRead(readerOf(user), id, new Date()))) throw new NotificationNotFound();
  }
}
