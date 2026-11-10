import { DomainException } from '../../../common/exceptions/base.exception';

export class UserNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'UserNotFound', 'El usuario no existe');
  }
}

// Spec 102: the only active admin cannot be deactivated.
export class LastActiveAdmin extends DomainException {
  constructor() {
    super('CONFLICT', 'LastActiveAdmin', 'No se puede desactivar al único administrador activo');
  }
}

// Spec 002: verifying a therapist's PIN from the tablet. WrongPin is 400, not 401:
// the tablet treats every 401 as "token revoked".
export class TherapistNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'TherapistNotFound', 'La terapeuta no existe o está desactivada');
  }
}

export class PinNotSet extends DomainException {
  constructor() {
    super('CONFLICT', 'PinNotSet', 'La terapeuta no tiene PIN: debe crearlo desde su cuenta');
  }
}

export class WrongPin extends DomainException {
  constructor() {
    super('INVALID', 'WrongPin', 'PIN incorrecto');
  }
}

export class PinLocked extends DomainException {
  constructor() {
    super('TOO_MANY_ATTEMPTS', 'PinLocked', 'Demasiados intentos. Espere un minuto.');
  }
}

export class PinRevoked extends DomainException {
  constructor() {
    super('CONFLICT', 'PinRevoked', 'Demasiados intentos: el PIN se anuló. Créelo de nuevo desde su cuenta.');
  }
}

export class NotAssignable extends DomainException {
  constructor() {
    super('INVALID', 'NotAssignable', 'Solo se asignan pacientes a terapeutas y representantes');
  }
}

export class UnknownPatients extends DomainException {
  constructor(missing: number) {
    super('INVALID', 'UnknownPatients', `${missing} patient(s) do not exist`, 'Algún paciente de la lista no existe');
  }
}
