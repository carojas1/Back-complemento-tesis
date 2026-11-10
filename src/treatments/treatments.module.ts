import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { GetTreatmentPlanUseCase } from './application/get-treatment-plan.use-case';
import { ListTreatmentProgressUseCase } from './application/list-treatment-progress.use-case';
import { SaveTreatmentPlanUseCase } from './application/save-treatment-plan.use-case';
import { TreatmentsRepository } from './domain/ports/treatments.repository';
import { TreatmentsController } from './infrastructure/http/treatments.controller';
import { TreatmentsPrismaRepository } from './infrastructure/prisma/treatments.prisma.repository';

// Sessions prescribed per patient and where each treatment stands.
@Module({
  imports: [AuthModule],
  controllers: [TreatmentsController],
  providers: [
    { provide: TreatmentsRepository, useClass: TreatmentsPrismaRepository },
    ListTreatmentProgressUseCase,
    GetTreatmentPlanUseCase,
    SaveTreatmentPlanUseCase,
  ],
})
export class TreatmentsModule {}
