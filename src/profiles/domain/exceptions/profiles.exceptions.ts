import { DomainException } from '../../../common/exceptions/base.exception';

export class ProfileNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'ProfileNotFound', 'El paciente no existe o no tiene perfil');
  }
}

// The therapist only sees and edits her assigned patients (agreed 2026-10-21).
export class PatientNotAssigned extends DomainException {
  constructor() {
    super('FORBIDDEN', 'PatientNotAssigned', 'No tiene asignado a este paciente');
  }
}

export class InvalidProfileSettings extends DomainException {
  constructor() {
    super(
      'INVALID',
      'InvalidProfileSettings',
      'Cuadrícula 4, 6, 9 o 12; nivel 1 a 3; velocidad de voz entre 0,5 y 1,5; de 5 a 20 consignas; de 5 a 60 segundos para repetir',
    );
  }
}

export class BoardItemNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'BoardItemNotFound', 'La categoría o el pictograma no está en el perfil, o ya no está activo en el catálogo');
  }
}

export class AlreadyOnBoard extends DomainException {
  constructor() {
    super('CONFLICT', 'AlreadyOnBoard', 'Ya está en el tablero del paciente');
  }
}

// Spec 010: the cloned voice is chosen only when it is ready.
export class ClonedVoiceNotReady extends DomainException {
  constructor() {
    super('CONFLICT', 'ClonedVoiceNotReady', 'El paciente todavía no tiene una voz clonada lista');
  }
}

// Spec 105 FR-004: audio (m4a from the app, webm or ogg from the browser) that weighs up to 200 KB as m4a.
export class InvalidRecording extends DomainException {
  constructor() {
    super('INVALID', 'InvalidRecording', 'La grabación debe ser un audio (m4a, webm u ogg) de hasta 200 KB');
  }
}

// Spec 105 FR-004: up to 3 seconds.
export class RecordingTooLong extends DomainException {
  constructor() {
    super('INVALID', 'RecordingTooLong', 'La grabación puede durar hasta 3 segundos');
  }
}
