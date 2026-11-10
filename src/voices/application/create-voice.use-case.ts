import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { Voice } from '../domain/entities/voice.entity';
import { InvalidVoiceSample, VoiceAlreadyExists, VoiceConsentRequired } from '../domain/exceptions/voices.exceptions';
import { VoiceJobs, VoicesRepository } from '../domain/ports/voices.repository';
import { toVoiceView } from './voice-view';

// Audio type from its first bytes: wav, mp3, m4a, webm or ogg.
const audioType = (b: Buffer) => {
  const head = b.subarray(0, 12).toString('latin1');
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (head.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (head.slice(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (b.readUInt32BE(0) === 0x1a45dfa3) return { ext: 'webm', mime: 'audio/webm' };
  if (head.startsWith('OggS')) return { ext: 'ogg', mime: 'audio/ogg' };
  return null;
};

// Spec 010 FR-004: the assigned therapist creates the patient's cloned voice from a trusted person's sample
// and confirms their written consent. It is audited; the base voice registration goes to the queue.
@Injectable()
export class CreateVoiceUseCase {
  constructor(
    private readonly voices: VoicesRepository,
    private readonly access: PatientAccess,
    private readonly storage: FileStorage,
    private readonly jobs: VoiceJobs,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: {
    patientId: string;
    therapistId: string;
    ownerName: string;
    relationship: string;
    consentDate: Date;
    consentConfirmed: boolean;
    transcript?: string;
    sample: Buffer | undefined;
    ip?: string;
  }) {
    if (!(await this.access.isAssigned(input.patientId, input.therapistId))) throw new PatientNotAssigned();
    if (!input.consentConfirmed) throw new VoiceConsentRequired();
    const type = input.sample && input.sample.length > 12 && input.sample.length <= 10_000_000 ? audioType(input.sample) : null;
    if (!type) throw new InvalidVoiceSample();
    if (await this.voices.findByPatient(input.patientId)) throw new VoiceAlreadyExists();

    const id = randomUUID();
    const samplePath = `voices/${id}/sample.${type.ext}`;
    await this.storage.put(samplePath, input.sample!, type.mime);
    const { patientId, ownerName, relationship, consentDate, therapistId: createdById } = input;
    const transcript = input.transcript || null;
    const voice = Voice.create({ id, patientId, ownerName, relationship, consentDate, samplePath, transcript, createdById });
    await this.voices.save(voice);
    await this.audit.record({
      action: 'VOICE_CREATE',
      actorType: 'USER',
      actorId: input.therapistId,
      entity: 'Voice',
      entityId: id,
      ip: input.ip,
      summary: { patientId: input.patientId, relationship: input.relationship, consentDate: input.consentDate.toISOString().slice(0, 10) },
    });
    await this.jobs.register(voice, input.therapistId); // the audios are generated when the therapist asks for them
    return toVoiceView(voice, await this.voices.progress(id), this.storage, null);
  }
}
