import { DomainException } from '../../../common/exceptions/base.exception';

export class AuditRecordNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'AuditRecordNotFound', 'No existe ese registro de auditoría');
  }
}
