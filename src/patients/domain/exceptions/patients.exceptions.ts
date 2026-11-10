import { DomainException } from '../../../common/exceptions/base.exception';

export class PatientNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'PatientNotFound', 'El paciente no existe');
  }
}

export class ConsentRequired extends DomainException {
  constructor() {
    super('INVALID', 'ConsentRequired', 'Falta la foto del consentimiento firmado (JPG o PNG de hasta 1 MB y 4096 px por lado)');
  }
}

export class UnknownTherapists extends DomainException {
  constructor() {
    super('INVALID', 'UnknownTherapists', 'Elija al menos una terapeuta activa');
  }
}

export class UnknownCatalogValue extends DomainException {
  constructor(what: string) {
    super('INVALID', 'UnknownCatalogValue', `${what} no existe o está desactivado`);
  }
}
