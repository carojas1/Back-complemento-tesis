import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { AudioModule } from '../common/audio/audio.module';
import { CreateProfileFromTemplateUseCase } from './application/create-profile-from-template.use-case';
import { EditBoardUseCase } from './application/edit-board.use-case';
import { GetProfileUseCase } from './application/get-profile.use-case';
import { SetRecordingUseCase } from './application/set-recording.use-case';
import { UpdateProfileUseCase } from './application/update-profile.use-case';
import { AudioConverter, PatientAccess, ProfilesRepository } from './domain/ports/profiles.repository';
import { FfmpegAudioConverter } from './infrastructure/audio/ffmpeg-audio.converter';
import { ProfilesController } from './infrastructure/http/profiles.controller';
import { PatientAccessPrisma, ProfilesPrismaRepository } from './infrastructure/prisma/profiles.prisma.repository';

// Exports creation from the template (patients, on registration) and the repository (sync, for the tablet).
@Module({
  imports: [AuthModule, AudioModule],
  controllers: [ProfilesController],
  providers: [
    { provide: ProfilesRepository, useClass: ProfilesPrismaRepository },
    { provide: PatientAccess, useClass: PatientAccessPrisma },
    { provide: AudioConverter, useClass: FfmpegAudioConverter },
    CreateProfileFromTemplateUseCase,
    GetProfileUseCase,
    UpdateProfileUseCase,
    EditBoardUseCase,
    SetRecordingUseCase,
  ],
  exports: [ProfilesRepository, PatientAccess, CreateProfileFromTemplateUseCase],
})
export class ProfilesModule {}
