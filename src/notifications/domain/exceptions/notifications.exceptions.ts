import { DomainException } from '../../../common/exceptions/base.exception';

export class NotificationNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'NotificationNotFound', 'No existe esa notificación');
  }
}
