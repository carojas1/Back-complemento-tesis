import { Module } from '@nestjs/common';
import { GetLimitsUseCase } from './application/get-limits.use-case';
import { QuotaReader } from './domain/ports/quota.reader';
import { LimitsController } from './infrastructure/http/limits.controller';
import { QuotaPrismaReader } from './infrastructure/prisma/quota.prisma.reader';

// Limits of each center (specialists and tablets). Exports QuotaReader for users and devices.
@Module({
  controllers: [LimitsController],
  providers: [{ provide: QuotaReader, useClass: QuotaPrismaReader }, GetLimitsUseCase],
  exports: [QuotaReader],
})
export class LimitsModule {}
