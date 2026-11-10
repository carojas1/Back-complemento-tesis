import { DomainException } from '../../../common/exceptions/base.exception';

// Same message for a nonexistent e-mail, wrong password or deactivated user.
export class InvalidCredentials extends DomainException {
  constructor(reason: string) {
    super('UNAUTHORIZED', 'InvalidCredentials', `Login rejected: ${reason}`, 'Correo o contraseña incorrectos');
  }
}

// Spec 113 FR-008: the password is valid for accounts in several institutions; the client repeats the login with `institutionId`.
export class ChooseInstitution extends DomainException {
  constructor(institutions: { id: string; name: string }[]) {
    super('CONFLICT', 'ChooseInstitution', 'Elija la institución', undefined, { institutions });
  }
}

export class AccountLocked extends DomainException {
  constructor() {
    super('TOO_MANY_ATTEMPTS', 'AccountLocked', 'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.');
  }
}

export class InvalidRefreshToken extends DomainException {
  constructor(reason: string) {
    super('UNAUTHORIZED', 'InvalidRefreshToken', `Refresh rejected: ${reason}`, 'La sesión venció. Inicie sesión de nuevo.');
  }
}

// Another request of the same browser (two tabs, a retry) already rotated this token. The browser keeps the new cookie.
export class RefreshRaceLost extends InvalidRefreshToken {}

export class InvalidResetToken extends DomainException {
  constructor() {
    super('INVALID', 'InvalidToken', 'El enlace no es válido o ya venció. Solicite uno nuevo.');
  }
}

export class WeakPassword extends DomainException {
  constructor() {
    super('INVALID', 'WeakPassword', 'La contraseña debe tener al menos 10 caracteres, con letras y números.');
  }
}

export class WeakPin extends DomainException {
  constructor() {
    super('INVALID', 'WeakPin', 'El PIN debe tener de 4 a 6 dígitos y no ser una secuencia como 1111 o 1234.');
  }
}

// The current password does not match on a password change (does not close the session: 400, not 401).
export class WrongPassword extends DomainException {
  constructor() {
    super('INVALID', 'WrongPassword', 'La contraseña actual no es correcta.');
  }
}

export class PasswordUnchanged extends DomainException {
  constructor() {
    super('INVALID', 'PasswordUnchanged', 'La contraseña nueva debe ser distinta de la actual.');
  }
}

// Temporary password pending: only POST /auth/change-password is allowed.
export class PasswordChangeRequired extends DomainException {
  constructor() {
    super('FORBIDDEN', 'PasswordChangeRequired', 'Debe cambiar la contraseña temporal antes de continuar.');
  }
}

export class EmailTaken extends DomainException {
  constructor() {
    super('CONFLICT', 'EmailTaken', 'Ese correo ya está registrado');
  }
}

export class SessionNotValid extends DomainException {
  constructor(reason: string) {
    super('UNAUTHORIZED', 'Unauthorized', `Access token rejected: ${reason}`, 'Sesión no válida o vencida');
  }
}
