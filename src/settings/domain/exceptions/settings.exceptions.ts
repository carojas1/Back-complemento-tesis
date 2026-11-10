import { DomainException } from '../../../common/exceptions/base.exception';

export class InvalidSetting extends DomainException {
  constructor(message: string) {
    super('INVALID', 'InvalidSetting', message);
  }
}

export class InvalidLogo extends DomainException {
  constructor() {
    super('INVALID', 'InvalidLogo', 'El logo debe ser una imagen PNG o JPG de hasta 2048 px por lado');
  }
}

// Spec 103 FR-007: generating a code or changing the PIN requires the current Center PIN.
export class WrongCenterPin extends DomainException {
  constructor() {
    super('FORBIDDEN', 'WrongCenterPin', 'El PIN del Centro no es correcto');
  }
}

export class CenterPinNotSet extends DomainException {
  constructor() {
    super('CONFLICT', 'CenterPinNotSet', 'Primero cree el PIN del Centro en "Configuración del Centro"');
  }
}
