import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { readerOf } from '../domain/entities/notification.entity';
import { NotificationsRepository } from '../domain/ports/notifications.repository';

// Marks the reader's whole inbox as read.
@Injectable()
export class MarkAllNotificationsReadUseCase {
  constructor(private readonly repo: NotificationsRepository) {}

  async execute(user: { role: Role; institutionId: string | null }) {
    return { updated: await this.repo.markAllRead(readerOf(user), new Date()) };
  }
}
