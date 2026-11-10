import { Injectable } from '@nestjs/common';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { VoiceNotFound } from '../domain/exceptions/voices.exceptions';
import { VoiceJobs, VoicesRepository } from '../domain/ports/voices.repository';
import { toVoiceView } from './voice-view';

// Status of the patient's cloned voice and how many profile words already have audio.
@Injectable()
export class GetVoiceUseCase {
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
    return toVoiceView(voice, await this.voices.progress(voice.id), this.storage, await this.jobs.activeGeneration(voice.id));
  }
}
