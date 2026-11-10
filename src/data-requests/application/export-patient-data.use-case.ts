import { Injectable } from '@nestjs/common';
import { SettingsRepository } from '../../settings/domain/ports/settings.repository';
import { ReportPdfUseCase } from '../../sessions/application/report-pdf.use-case';
import { ExportArchive } from '../domain/ports/data-requests.repository';
import { Actor, DataRequestSupport } from './data-request-actor';

// Right of access (spec 110 T003): ZIP with the record as PDF, the full-history report, observations, goals,
// sessions, events and activity results as CSV. Open access requests are marked as handled.
@Injectable()
export class ExportPatientDataUseCase {
  constructor(
    private readonly support: DataRequestSupport,
    private readonly reportPdf: ReportPdfUseCase,
    private readonly settings: SettingsRepository,
    private readonly archive: ExportArchive,
  ) {}

  async execute(patientId: string, actor: Actor) {
    const patient = await this.support.assignedPatient({ id: patientId }, actor);
    const { pdf } = await this.reportPdf.execute(
      patientId,
      { from: patient.createdAt, to: new Date() },
      { therapistId: actor.userId, ip: actor.ip },
    );
    const [data, { centerName }] = await Promise.all([this.support.patients.exportData(patientId), this.settings.get()]);
    const { zip, files } = await this.archive.build({ centerName, data, reportPdf: pdf });

    const answered = await this.support.requests.findOpen(patient.code, 'ACCESS');
    for (const request of answered) {
      request.complete(actor.userId);
      await this.support.requests.save(request);
    }
    await this.support.record(
      {
        action: 'DATA_EXPORT',
        entity: 'Patient',
        entityId: patient.id,
        patientCode: patient.code,
        summary: { files, requestIds: answered.map((r) => r.id) },
      },
      actor,
    );
    return { zip, filename: `datos-${patient.code}.zip` };
  }
}
