import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ProfilesModule } from '../profiles/profiles.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SettingsModule } from '../settings/settings.module';
import { CompleteRectificationUseCase } from './application/complete-rectification.use-case';
import { CreateDataRequestUseCase } from './application/create-data-request.use-case';
import { DataRequestSupport } from './application/data-request-actor';
import { ExecuteDeletionUseCase } from './application/execute-deletion.use-case';
import { ExportPatientDataUseCase } from './application/export-patient-data.use-case';
import { ListDataRequestsUseCase } from './application/list-data-requests.use-case';
import { RejectDataRequestUseCase } from './application/reject-data-request.use-case';
import { DataRequestsRepository, ExportArchive, PatientEraser, PatientRecords } from './domain/ports/data-requests.repository';
import { ZipExportArchive } from './infrastructure/export/zip-export.archive';
import { DataRequestsController } from './infrastructure/http/data-requests.controller';
import { DataRequestsPrismaRepository } from './infrastructure/prisma/data-requests.prisma.repository';
import { PatientEraserPrisma } from './infrastructure/prisma/patient-eraser.prisma';
import { PatientRecordsPrisma } from './infrastructure/prisma/patient-records.prisma';

// Spec 110: data rights. ProfilesModule: assignment (PatientAccess). SessionsModule: report PDF.
// SettingsModule: Center name on the record.
@Module({
  imports: [AuthModule, ProfilesModule, SessionsModule, SettingsModule],
  controllers: [DataRequestsController],
  providers: [
    { provide: DataRequestsRepository, useClass: DataRequestsPrismaRepository },
    { provide: PatientRecords, useClass: PatientRecordsPrisma },
    { provide: PatientEraser, useClass: PatientEraserPrisma },
    { provide: ExportArchive, useClass: ZipExportArchive },
    DataRequestSupport,
    CreateDataRequestUseCase,
    ListDataRequestsUseCase,
    ExportPatientDataUseCase,
    CompleteRectificationUseCase,
    RejectDataRequestUseCase,
    ExecuteDeletionUseCase,
  ],
  exports: [ExportPatientDataUseCase], // the document queue (jobs module) generates the ZIP
})
export class DataRequestsModule {}
