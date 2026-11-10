import { Injectable } from '@nestjs/common';
import { VoiceJobRunner } from '../../../voices/application/voice-job.runner';
import { Job } from '../../domain/entities/job.entity';
import { JobHandlers } from '../../domain/ports/jobs.repository';
import { DocumentJobHandlers } from './document-job.handlers';

// Dispatches each job to the owning module: documents to sessions and data-requests, voice to voices.
@Injectable()
export class QueueJobHandlers extends JobHandlers {
  constructor(
    private readonly documents: DocumentJobHandlers,
    private readonly voices: VoiceJobRunner,
  ) {
    super();
  }

  run(job: Job) {
    if (job.type === 'VOICE_REGISTER' || job.type === 'VOICE_CLIPS') return this.voices.run(job.type, job.params.voiceId);
    return this.documents.run(job);
  }
}
