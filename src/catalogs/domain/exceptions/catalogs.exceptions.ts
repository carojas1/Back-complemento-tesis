import { DomainException } from '../../../common/exceptions/base.exception';

export class CatalogItemNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'CatalogItemNotFound', 'El elemento del catálogo no existe');
  }
}

export class CatalogNameTaken extends DomainException {
  constructor() {
    super('CONFLICT', 'CatalogNameTaken', 'Ya existe un elemento con ese nombre');
  }
}

// Only the administrator edits avatars; therapists can also edit diagnoses and conditions.
export class AvatarsAdminOnly extends DomainException {
  constructor() {
    super('FORBIDDEN', 'AvatarsAdminOnly', 'Solo el administrador edita los avatares');
  }
}

export class InvalidAvatarImage extends DomainException {
  constructor() {
    super('INVALID', 'InvalidAvatarImage', 'El avatar debe ser una imagen SVG, PNG o JPEG de hasta 200 KB');
  }
}
