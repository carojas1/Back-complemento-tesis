// Cloned voice of a person the patient trusts (spec 010 FR-004/005). Biometric data: born with consent.
export type VoiceStatus = 'PENDING' | 'READY' | 'FAILED';

export interface VoiceProps {
  id: string;
  patientId: string;
  ownerName: string; // who lends their voice
  relationship: string; // relationship to the patient
  consentDate: Date; // date of the written consent
  samplePath: string; // 5 to 15 s sample in the bucket
  transcript: string | null; // what the sample says (optional, improves the cloning)
  engineVoiceId: string | null; // id in the cloning service
  status: VoiceStatus;
  error: string | null;
  createdById: string;
  createdAt: Date;
}

export interface Voice extends Readonly<VoiceProps> {}
export class Voice {
  private constructor(props: VoiceProps) {
    Object.assign(this, props);
  }

  static create(props: Omit<VoiceProps, 'engineVoiceId' | 'status' | 'error' | 'createdAt'>) {
    return new Voice({ ...props, engineVoiceId: null, status: 'PENDING', error: null, createdAt: new Date() });
  }

  static reconstitute(props: VoiceProps) {
    return new Voice(props);
  }

  // The cloning service accepted the sample: it is now the base voice; audios are generated on request.
  registered(engineVoiceId: string) {
    Object.assign(this, { engineVoiceId, status: 'READY', error: null });
  }

  failed(error: string) {
    Object.assign(this, { status: 'FAILED', error: error.slice(0, 500) });
  }
}
