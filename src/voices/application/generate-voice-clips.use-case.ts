import { Injectable } from '@nestjs/common';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { VoiceNotFound, VoiceNotReady } from '../domain/exceptions/voices.exceptions';
import { VoiceJobs, VoicesRepository } from '../domain/ports/voices.repository';
import { toVoiceView } from './voice-view';

// Spec 010: "Generar voces" queues the generation, with the base voice, of only the board pictograms that do not yet
// have audio. A double tap does not enqueue two.
@Injectable()
export class GenerateVoiceClipsUseCase {
  constructor(
    private readonly voices: VoicesRepository,
    private readonly access: PatientAccess,
    private readonly storage: FileStorage,
    private readonly jobs: VoiceJobs,
  ) {}

  async execute(input: { patientId: string; therapistId: string }) {
    if (!(await this.access.isAssigned(input.patientId, input.therapistId))) throw new PatientNotAssigned();
    const voice = await this.voices.findByPatient(input.patientId);
    if (!voice) throw new VoiceNotFound();
    if (voice.status !== 'READY') throw new VoiceNotReady();
    const jobId = await this.jobs.generate(voice, input.therapistId);
    return toVoiceView(voice, await this.voices.progress(voice.id), this.storage, jobId);
  }
}
