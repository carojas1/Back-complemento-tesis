import { DomainException } from '../../../common/exceptions/base.exception';

export class PatientNotLinked extends DomainException {
  constructor() {
    super('FORBIDDEN', 'PatientNotLinked', 'Este paciente no está vinculado a su cuenta');
  }
}
