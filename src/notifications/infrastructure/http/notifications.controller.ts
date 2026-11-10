import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, GetUser, Role, type AuthenticatedUser } from '../../../auth';
import { CountUnreadNotificationsUseCase } from '../../application/count-unread-notifications.use-case';
import { ListNotificationsUseCase } from '../../application/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from '../../application/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../../application/mark-notification-read.use-case';
import { ListNotificationsQuery } from './notifications.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Inbox of the admin panels: the super admin sees the platform's; a center admin, their center's.
@ApiTags('notifications')
@Auth(Role.SUPER_ADMIN, Role.ADMIN)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly countUnread: CountUnreadNotificationsUseCase,
    private readonly markNotificationRead: MarkNotificationReadUseCase,
    private readonly markAllNotificationsRead: MarkAllNotificationsReadUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Notifications, newest first (paginated; optionally only unread ones)' })
  list(@Query() query: ListNotificationsQuery, @GetUser() user: AuthenticatedUser) {
    return this.listNotifications.execute(user, query.unreadOnly ?? false, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications (the bell badge)' })
  unreadCount(@GetUser() user: AuthenticatedUser) {
    return this.countUnread.execute(user);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marks a notification as read' })
  async markRead(@Param('id', uuid) id: string, @GetUser() user: AuthenticatedUser) {
    await this.markNotificationRead.execute(user, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marks all notifications in the inbox as read' })
  markAllRead(@GetUser() user: AuthenticatedUser) {
    return this.markAllNotificationsRead.execute(user);
  }
}
