import { Page, PageRequest } from '../../../common/pagination/page';
import { NewNotification, Notification, NotificationReader } from '../entities/notification.entity';

// Port other modules notify through (institutions). Writes as table owner: the API role can only read
// and mark the notifications of its center.
export abstract class NotificationPublisher {
  abstract publish(notification: NewNotification): Promise<void>;
}

export abstract class NotificationsRepository {
  abstract list(reader: NotificationReader, unreadOnly: boolean, page: PageRequest): Promise<Page<Notification>>;
  abstract countUnread(reader: NotificationReader): Promise<number>;
  // False when the notification does not exist for the reader.
  abstract markRead(reader: NotificationReader, id: string, now: Date): Promise<boolean>;
  abstract markAllRead(reader: NotificationReader, now: Date): Promise<number>;
}
