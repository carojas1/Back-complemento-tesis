import { Module } from '@nestjs/common';
import { CheckHealthUseCase } from './application/check-health.use-case';
import { DatabaseProbe } from './domain/ports/database.probe';
import { HealthController } from './infrastructure/http/health.controller';
import { DatabasePrismaProbe } from './infrastructure/prisma/database.prisma.probe';

// Public health check (constitution §3), used by the Docker healthcheck.
@Module({ controllers: [HealthController], providers: [{ provide: DatabaseProbe, useClass: DatabasePrismaProbe }, CheckHealthUseCase] })
export class HealthModule {}
