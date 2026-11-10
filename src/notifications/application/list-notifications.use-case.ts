import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { PageRequest } from '../../common/pagination/page';
import { readerOf } from '../domain/entities/notification.entity';
import { NotificationsRepository } from '../domain/ports/notifications.repository';

// The reader's inbox, newest first.
@Injectable()
export class ListNotificationsUseCase {
  constructor(private readonly repo: NotificationsRepository) {}

  execute(user: { role: Role; institutionId: string | null }, unreadOnly: boolean, page: PageRequest) {
    return this.repo.list(readerOf(user), unreadOnly, page);
  }
}
