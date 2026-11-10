import { DomainException } from '../../../common/exceptions/base.exception';

export class CategoryNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'CategoryNotFound', 'La categoría no existe');
  }
}

export class CategoryNameTaken extends DomainException {
  constructor() {
    super('CONFLICT', 'CategoryNameTaken', 'Ya existe una categoría con ese nombre');
  }
}

export class UnknownPictograms extends DomainException {
  constructor(missing: number) {
    super('INVALID', 'UnknownPictograms', `${missing} pictograma(s) no existen`, 'Algún pictograma de la lista no existe');
  }
}
