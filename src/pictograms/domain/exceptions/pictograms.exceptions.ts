import { DomainException } from '../../../common/exceptions/base.exception';

export class PictogramNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'PictogramNotFound', 'El pictograma no existe');
  }
}

export class ArasaacPictogramNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'ArasaacPictogramNotFound', 'ARASAAC no tiene ese pictograma');
  }
}

export class ArasaacUnavailable extends DomainException {
  constructor() {
    super('INVALID', 'ArasaacUnavailable', 'ARASAAC no responde. Intente más tarde.');
  }
}

export class InvalidImage extends DomainException {
  constructor() {
    super('INVALID', 'InvalidImage', 'La imagen debe ser PNG o JPEG de hasta 1 MB y 4096 px por lado');
  }
}
