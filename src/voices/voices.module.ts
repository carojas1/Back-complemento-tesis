import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { AudioModule } from '../common/audio/audio.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { CreateVoiceUseCase } from './application/create-voice.use-case';
import { DeleteVoiceUseCase } from './application/delete-voice.use-case';
import { GenerateVoiceClipsUseCase } from './application/generate-voice-clips.use-case';
import { GetVoiceUseCase } from './application/get-voice.use-case';
import { VoiceJobRunner } from './application/voice-job.runner';
import { VoiceJobs, VoicesRepository, VoiceSynthesizer } from './domain/ports/voices.repository';
import { CloneVoiceSynthesizer } from './infrastructure/clone/clone-voice.synthesizer';
import { VoicesController } from './infrastructure/http/voices.controller';
import { VoiceJobsPrisma } from './infrastructure/prisma/voice-jobs.prisma';
import { VoicesPrismaRepository } from './infrastructure/prisma/voices.prisma.repository';

// The patient's cloned voice (spec 010 FR-004/005). Uses PatientAccess from profiles. The heavy work goes through the queue
// (jobs module): here it is enqueued and VoiceJobRunner does it in the worker process.
@Module({
  imports: [AuthModule, ProfilesModule, AudioModule],
  controllers: [VoicesController],
  providers: [
    { provide: VoicesRepository, useClass: VoicesPrismaRepository },
    { provide: VoiceSynthesizer, useClass: CloneVoiceSynthesizer },
    { provide: VoiceJobs, useClass: VoiceJobsPrisma },
    VoiceJobRunner,
    CreateVoiceUseCase,
    GetVoiceUseCase,
    DeleteVoiceUseCase,
    GenerateVoiceClipsUseCase,
  ],
  exports: [VoiceJobRunner],
})
export class VoicesModule {}
