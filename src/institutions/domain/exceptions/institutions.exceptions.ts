import { DomainException } from '../../../common/exceptions/base.exception';

export class RequestNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'RequestNotFound', 'No existe esa solicitud');
  }
}

// Already approved or rejected (also if two reviews arrive at once: only one wins).
export class RequestAlreadyReviewed extends DomainException {
  constructor() {
    super('CONFLICT', 'RequestAlreadyReviewed', 'Esta solicitud ya fue revisada');
  }
}

export class RequestAlreadyPending extends DomainException {
  constructor() {
    super('CONFLICT', 'RequestAlreadyPending', 'Ya hay una solicitud de esa institución en revisión');
  }
}

export class InstitutionExists extends DomainException {
  constructor() {
    super('CONFLICT', 'InstitutionExists', 'Esa institución ya tiene cuenta');
  }
}

export class InstitutionNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'InstitutionNotFound', 'No existe esa institución');
  }
}

// The template center holds the base catalogs of every new center: it is never suspended.
export class TemplateInstitutionLocked extends DomainException {
  constructor() {
    super('CONFLICT', 'TemplateInstitutionLocked', 'La institución plantilla no se puede suspender');
  }
}
