import { DomainException } from '../../../common/exceptions/base.exception';

export class BatchTooLarge extends DomainException {
  constructor() {
    super('TOO_LARGE', 'BatchTooLarge', 'Máximo 100 registros por lote');
  }
}
