import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { GetVocabularyUseCase } from './application/get-vocabulary.use-case';
import { VocabularyRepository } from './domain/ports/vocabulary.repository';
import { VocabularyController } from './infrastructure/http/vocabulary.controller';
import { VocabularyPrismaRepository } from './infrastructure/prisma/vocabulary.prisma.repository';

// Read-only for the tablet. DevicesModule provides @DeviceAuth; FileStorage is global.
@Module({
  imports: [DevicesModule],
  controllers: [VocabularyController],
  providers: [{ provide: VocabularyRepository, useClass: VocabularyPrismaRepository }, GetVocabularyUseCase],
})
export class VocabularyModule {}
