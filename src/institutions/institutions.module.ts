import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreateInstitutionAdminUseCase } from './application/create-institution-admin.use-case';
import { GetInstitutionUseCase } from './application/get-institution.use-case';
import { GetPlatformDashboardUseCase } from './application/get-platform-dashboard.use-case';
import { PlatformUseCases } from './application/platform.use-cases';
import { RequestInstitutionUseCase } from './application/request-institution.use-case';
import { SaveRequestNotesUseCase } from './application/save-request-notes.use-case';
import { SetInstitutionStatusUseCase } from './application/set-institution-status.use-case';
import { StartRequestReviewUseCase } from './application/start-request-review.use-case';
import { UpdateInstitutionUseCase } from './application/update-institution.use-case';
import { InstitutionsRepository } from './domain/ports/institutions.repository';
import { InstitutionRequestsController, PlatformController } from './infrastructure/http/institutions.controller';
import { PublicClientGuard } from './infrastructure/http/public-client.guard';
import { InstitutionsPrismaRepository } from './infrastructure/prisma/institutions.prisma.repository';

// Spec 113: account requests and super admin routes. FileStorage comes from the global StorageModule.
@Module({
  imports: [AuthModule, DevicesModule, NotificationsModule], // DevicesModule: the "Request" AppKeyGuard
  controllers: [InstitutionRequestsController, PlatformController],
  providers: [
    { provide: InstitutionsRepository, useClass: InstitutionsPrismaRepository },
    RequestInstitutionUseCase,
    PlatformUseCases,
    StartRequestReviewUseCase,
    SaveRequestNotesUseCase,
    GetInstitutionUseCase,
    UpdateInstitutionUseCase,
    SetInstitutionStatusUseCase,
    CreateInstitutionAdminUseCase,
    GetPlatformDashboardUseCase,
    PublicClientGuard,
  ],
})
export class InstitutionsModule {}
