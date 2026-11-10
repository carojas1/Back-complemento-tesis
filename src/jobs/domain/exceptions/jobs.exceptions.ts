import { DomainException } from '../../../common/exceptions/base.exception';

// Also for another person's jobs: it is not revealed that they exist.
export class JobNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'JobNotFound', 'El trabajo no existe');
  }
}

export class JobNotCancelable extends DomainException {
  constructor() {
    super('CONFLICT', 'JobNotCancelable', 'Solo se puede cancelar un trabajo que todavía está en cola');
  }
}

// The person who requested it was deactivated while waiting in the queue.
export class JobRequesterInactive extends DomainException {
  constructor() {
    super('FORBIDDEN', 'JobRequesterInactive', 'La cuenta que pidió el archivo ya no está activa');
  }
}
