import { Module } from '@nestjs/common';
import { GetAppUsageUseCase } from './application/get-app-usage.use-case';
import { GetCenterAnalyticsUseCase } from './application/get-center-analytics.use-case';
import { GetCenterOverviewUseCase } from './application/get-center-overview.use-case';
import { ListPatientUsageUseCase } from './application/list-patient-usage.use-case';
import { DashboardReadModel } from './domain/ports/dashboard.read-model';
import { DashboardController } from './infrastructure/http/dashboard.controller';
import { DashboardPrismaReadModel } from './infrastructure/prisma/dashboard.prisma.read-model';

// Home of the center admin, period metrics and usage per patient and of the app (for the admin, never clinical data).
@Module({
  controllers: [DashboardController],
  providers: [
    { provide: DashboardReadModel, useClass: DashboardPrismaReadModel },
    GetCenterOverviewUseCase,
    GetCenterAnalyticsUseCase,
    ListPatientUsageUseCase,
    GetAppUsageUseCase,
  ],
})
export class DashboardModule {}
