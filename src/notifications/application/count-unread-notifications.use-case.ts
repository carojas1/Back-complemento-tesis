import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { readerOf } from '../domain/entities/notification.entity';
import { NotificationsRepository } from '../domain/ports/notifications.repository';

// The number on the bell.
@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(private readonly repo: NotificationsRepository) {}

  async execute(user: { role: Role; institutionId: string | null }) {
    return { unread: await this.repo.countUnread(readerOf(user)) };
  }
}
