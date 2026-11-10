import { Role } from '../../../auth/domain/entities/user.entity';

// Notification of the admin panels. PLATFORM goes to the super admins (no institution); INSTITUTION, to
// the admins of one center. One row per audience: whoever reads it first marks it read for the rest.
export type NotificationAudience = 'PLATFORM' | 'INSTITUTION';
export type NotificationType =
  | 'INSTITUTION_REQUEST_CREATED'
  | 'INSTITUTION_APPROVED'
  | 'INSTITUTION_REACTIVATED'
  | 'SUBSCRIPTION_PAYMENT_RECORDED'
  | 'SUBSCRIPTION_CANCELED';

export interface Notification {
  id: string;
  institutionId: string | null;
  audience: NotificationAudience;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

// What a module sends: the destination is the platform or exactly one center.
export type NewNotification = Pick<Notification, 'type' | 'title' | 'body'> & { link?: string } & (
    { audience: 'PLATFORM' } | { audience: 'INSTITUTION'; institutionId: string }
  );

// Who reads: the super admin reads PLATFORM; a center admin, INSTITUTION of their center.
export type NotificationReader = { audience: 'PLATFORM' } | { audience: 'INSTITUTION'; institutionId: string };

// The inbox comes only from the credential, never from the request (RLS also keeps a center's inbox inside it).
export const readerOf = (user: { role: Role; institutionId: string | null }): NotificationReader =>
  user.role === Role.SUPER_ADMIN || !user.institutionId
    ? { audience: 'PLATFORM' }
    : { audience: 'INSTITUTION', institutionId: user.institutionId };
