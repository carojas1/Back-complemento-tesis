import { DomainException } from '../../../common/exceptions/base.exception';

export class RoomNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'RoomNotFound', 'No existe ese consultorio');
  }
}

export class RoomNameTaken extends DomainException {
  constructor() {
    super('CONFLICT', 'RoomNameTaken', 'Ya existe un consultorio con ese nombre');
  }
}

export class InvalidCenterHours extends DomainException {
  constructor() {
    super('INVALID', 'InvalidCenterHours', 'Cada día abre antes de cerrar y aparece una sola vez');
  }
}
