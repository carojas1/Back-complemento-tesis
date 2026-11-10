import { DomainException } from '../../../common/exceptions/base.exception';

export class DataRequestNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'DataRequestNotFound', 'La solicitud no existe');
  }
}

export class DataRequestClosed extends DomainException {
  constructor() {
    super('CONFLICT', 'DataRequestClosed', 'La solicitud ya fue atendida o rechazada');
  }
}

const typeNames = { ACCESS: 'acceso', RECTIFICATION: 'rectificación', DELETION: 'eliminación' };

export class DataRequestWrongType extends DomainException {
  constructor(expected: keyof typeof typeNames) {
    super('CONFLICT', 'DataRequestWrongType', `Esta acción es solo para solicitudes de ${typeNames[expected]}`);
  }
}

// Double confirmation of the deletion: the patient code must be typed.
export class ConfirmCodeMismatch extends DomainException {
  constructor() {
    super('INVALID', 'ConfirmCodeMismatch', 'El código escrito no coincide con el del paciente');
  }
}
