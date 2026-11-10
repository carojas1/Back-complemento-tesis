import { Injectable } from '@nestjs/common';
import { PatientNotFound } from '../../patients/domain/exceptions/patients.exceptions';
import { SettingsRepository } from '../../settings/domain/ports/settings.repository';
import { Period, ReportRenderer, SessionsReadModel } from '../domain/ports/sessions.read-model';
import { SessionsUseCases } from './sessions.use-cases';

// Spec 107 T007 + 108 T005: the report PDF with the same indicators as GET /patients/:id/reports,
// plus the Center name and the period's observations and objectives. REPORT_EXPORT is audited.
@Injectable()
export class ReportPdfUseCase {
  constructor(
    private readonly sessions: SessionsUseCases,
    private readonly read: SessionsReadModel,
    private readonly settings: SettingsRepository,
    private readonly renderer: ReportRenderer,
  ) {}

  async execute(patientId: string, period: Partial<Period>, reader: { therapistId: string; ip?: string }) {
    const { from, to, ...report } = await this.sessions.report(patientId, period, reader, 'pdf');
    const patient = await this.read.reportContext(patientId, { from, to });
    if (!patient) throw new PatientNotFound();
    const { centerName } = await this.settings.get();
    const pdf = await this.renderer.render({ centerName, patient, period: { from, to }, report });
    return { pdf, filename: `reporte-${patient.code}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.pdf` };
  }
}
