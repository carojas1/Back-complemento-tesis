import { DomainException } from '../../../common/exceptions/base.exception';

// Same message for a nonexistent, expired or used code (does not reveal which).
export class InvalidRegistrationCode extends DomainException {
  constructor(reason: string) {
    super('INVALID', 'InvalidCode', `Registration rejected: ${reason}`, 'Código no válido o vencido');
  }
}

export class InvalidPublicKey extends DomainException {
  constructor() {
    super('INVALID', 'InvalidPublicKey', 'La llave pública debe ser ECDSA P-256 en formato SPKI base64');
  }
}

// Invalid token, signature or date, or revoked tablet: the app wipes the token and goes back to registration (spec 001).
// The tablet is fine but its center is suspended. Never a 401: the app wipes its token on 401 and could not come back.
export class InstitutionSuspended extends DomainException {
  constructor() {
    super('FORBIDDEN', 'InstitutionSuspended', 'Este centro está suspendido. Comuníquese con el administrador de la plataforma.');
  }
}

export class DeviceUnauthorized extends DomainException {
  constructor(reason: string) {
    super('UNAUTHORIZED', 'DeviceUnauthorized', `Tablet rejected: ${reason}`, 'Tableta no autorizada');
  }
}

export class InvalidAppKey extends DomainException {
  constructor() {
    super('FORBIDDEN', 'InvalidAppKey', 'X-App-Key missing or invalid', 'Aplicación no autorizada');
  }
}

export class DeviceNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'DeviceNotFound', 'La tableta no existe');
  }
}
