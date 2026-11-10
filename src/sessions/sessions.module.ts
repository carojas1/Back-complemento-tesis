import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ProfilesModule } from '../profiles/profiles.module';
import { SettingsModule } from '../settings/settings.module';
import { ReportPdfUseCase } from './application/report-pdf.use-case';
import { SessionsUseCases } from './application/sessions.use-cases';
import { ReportRenderer, SessionsReadModel } from './domain/ports/sessions.read-model';
import { SessionsController } from './infrastructure/http/sessions.controller';
import { PdfmakeReportRenderer } from './infrastructure/pdf/pdfmake-report.renderer';
import { SessionsPrismaReadModel } from './infrastructure/prisma/sessions.prisma.read-model';

// Spec 107: reading the sessions that tablets upload (sync module) and the report PDF.
// Exports the PDF for data export (spec 110). SettingsModule: Center name in the header.
@Module({
  imports: [AuthModule, ProfilesModule, SettingsModule],
  controllers: [SessionsController],
  providers: [
    { provide: SessionsReadModel, useClass: SessionsPrismaReadModel },
    { provide: ReportRenderer, useClass: PdfmakeReportRenderer },
    SessionsUseCases,
    ReportPdfUseCase,
  ],
  exports: [ReportPdfUseCase, SessionsReadModel],
})
export class SessionsModule {}
