import { Injectable } from '@nestjs/common';
import { ExportPatientDataUseCase } from '../../../data-requests/application/export-patient-data.use-case';
import { PatientNotFound } from '../../../patients/domain/exceptions/patients.exceptions';
import { ReportPdfUseCase } from '../../../sessions/application/report-pdf.use-case';
import { Job } from '../../domain/entities/job.entity';

const date = (iso?: string) => (iso ? new Date(iso) : undefined);

// Each job type calls the use case that owns the data, as if the therapist had requested it: they re-check
// the assignment and audit (REPORT_EXPORT, DATA_EXPORT) with the IP stored at enqueue time.
@Injectable()
export class DocumentJobHandlers {
  constructor(
    private readonly reportPdf: ReportPdfUseCase,
    private readonly exportData: ExportPatientDataUseCase,
  ) {}

  async run(job: Job) {
    if (!job.patientId) throw new PatientNotFound(); // the patient was deleted while waiting
    const { from, to, ip } = job.params;
    if (job.type === 'REPORT_PDF') {
      const { pdf, filename } = await this.reportPdf.execute(
        job.patientId,
        { from: date(from), to: date(to) },
        { therapistId: job.requestedBy, ip },
      );
      return { file: pdf, fileName: filename, contentType: 'application/pdf' };
    }
    const { zip, filename } = await this.exportData.execute(job.patientId, { userId: job.requestedBy, ip });
    return { file: zip, fileName: filename, contentType: 'application/zip' };
  }
}
