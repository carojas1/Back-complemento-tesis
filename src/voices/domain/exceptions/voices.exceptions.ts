import { DomainException } from '../../../common/exceptions/base.exception';

export class VoiceNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'VoiceNotFound', 'El paciente no tiene voz clonada');
  }
}

export class VoiceAlreadyExists extends DomainException {
  constructor() {
    super('CONFLICT', 'VoiceAlreadyExists', 'El paciente ya tiene una voz clonada: bórrela para crear otra');
  }
}

// Spec 010 FR-004: biometric data, it is not stored without consent.
export class VoiceConsentRequired extends DomainException {
  constructor() {
    super('INVALID', 'VoiceConsentRequired', 'Confirme el consentimiento escrito de la persona dueña de la voz');
  }
}

export class VoiceNotReady extends DomainException {
  constructor() {
    super('CONFLICT', 'VoiceNotReady', 'La voz clonada todavía no está lista');
  }
}

export class InvalidVoiceSample extends DomainException {
  constructor() {
    super('INVALID', 'InvalidVoiceSample', 'La muestra debe ser un audio (wav, mp3, m4a, webm u ogg) de hasta 10 MB');
  }
}
