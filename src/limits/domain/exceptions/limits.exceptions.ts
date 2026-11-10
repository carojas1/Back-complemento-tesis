import { DomainException } from '../../../common/exceptions/base.exception';

const labels = { therapists: 'terapeutas', devices: 'tabletas' } as const;

// The super admin limits how many specialists or tablets a center may have.
export class LimitReached extends DomainException {
  constructor(resource: 'therapists' | 'devices', limit: number) {
    super('CONFLICT', 'LimitReached', `Este centro llegó a su límite de ${labels[resource]} (${limit})`, undefined, { resource, limit });
  }
}
