import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { SettingsModule } from '../settings/settings.module';
import { ExportAuditUseCase } from './application/export-audit.use-case';
import { GetAuditRecordUseCase } from './application/get-audit-record.use-case';
import { ListAuditUseCase } from './application/list-audit.use-case';
import { AuditFileRenderer, AuditRepository } from './domain/ports/audit.repository';
import { AuditFilesRenderer } from './infrastructure/export/audit-files.renderer';
import { AuditController } from './infrastructure/http/audit.controller';
import { AuditPrismaRepository } from './infrastructure/prisma/audit.prisma.repository';

// Spec 109: reading the audit. Writing stays in auth's AuthAuditLog port.
@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [AuditController],
  providers: [
    { provide: AuditRepository, useClass: AuditPrismaRepository },
    { provide: AuditFileRenderer, useClass: AuditFilesRenderer },
    ListAuditUseCase,
    ExportAuditUseCase,
    GetAuditRecordUseCase,
  ],
})
export class AuditModule {}
