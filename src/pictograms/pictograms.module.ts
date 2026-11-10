import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ImportArasaacPictogramUseCase } from './application/import-arasaac-pictogram.use-case';
import { SearchArasaacUseCase } from './application/search-arasaac.use-case';
import { SearchPictogramsUseCase } from './application/search-pictograms.use-case';
import { UpdatePictogramUseCase } from './application/update-pictogram.use-case';
import { UploadPictogramUseCase } from './application/upload-pictogram.use-case';
import { ArasaacClient, PictogramsRepository } from './domain/ports/pictograms.repository';
import { ArasaacHttpClient } from './infrastructure/arasaac/arasaac-http.client';
import { PictogramsController } from './infrastructure/http/pictograms.controller';
import { PictogramsPrismaRepository } from './infrastructure/prisma/pictograms.prisma.repository';

// AuthModule: audit and decorators. FileStorage (bucket) is global.
@Module({
  imports: [AuthModule],
  controllers: [PictogramsController],
  providers: [
    { provide: PictogramsRepository, useClass: PictogramsPrismaRepository },
    { provide: ArasaacClient, useClass: ArasaacHttpClient },
    SearchPictogramsUseCase,
    SearchArasaacUseCase,
    ImportArasaacPictogramUseCase,
    UploadPictogramUseCase,
    UpdatePictogramUseCase,
  ],
  // categories validates pictograms with the repository; the basic-vocabulary script imports from ARASAAC.
  exports: [PictogramsRepository, ArasaacClient, ImportArasaacPictogramUseCase],
})
export class PictogramsModule {}
