import { Injectable } from '@nestjs/common';
import { dataTable, renderPdf } from '../../../common/pdf/pdf';
import { renderXlsx } from '../../../common/spreadsheet/xlsx';
import { centerOffsetMs } from '../../../common/time/center-time';
import { auditActionLabel, auditActorTypeLabel } from '../../domain/audit-labels';
import { AuditFileRenderer, AuditFileRequest, AuditRecord } from '../../domain/ports/audit.repository';

// Date and time as the center lives them, not in UTC.
const localDateTime = (date: Date) => new Date(date.getTime() - centerOffsetMs).toISOString().slice(0, 16).replace('T', ' ');

const toRow = (record: AuditRecord) => [
  localDateTime(record.createdAt),
  record.actorName ?? auditActorTypeLabel(record.actorType),
  auditActionLabel(record.action),
  record.patientCode ?? '',
  record.ip ?? '',
];

const columns = [
  { title: 'Fecha y hora', width: 18 },
  { title: 'Quién', width: 30 },
  { title: 'Qué hizo', width: 44 },
  { title: 'Paciente', width: 12 },
  { title: 'Dirección IP', width: 18 },
];

@Injectable()
export class AuditFilesRenderer extends AuditFileRenderer {
  xlsx(records: AuditRecord[]) {
    return renderXlsx('Auditoría', columns, records.map(toRow));
  }

  pdf({ records, total, centerName, generatedAt }: AuditFileRequest) {
    const shown =
      records.length < total
        ? `Muestra ${records.length} de ${total} registros. Exporte a Excel para verlos todos.`
        : `${total} registros.`;
    return renderPdf({
      pageOrientation: 'landscape',
      content: [
        { text: `Auditoría de ${centerName}`, style: 'title' },
        { text: `Generado el ${localDateTime(generatedAt)}. ${shown}`, style: 'subtitle' },
        dataTable(
          columns.map(({ title }) => title),
          records.map(toRow),
          [90, 170, '*', 60, 80],
        ),
      ],
    });
  }
}
