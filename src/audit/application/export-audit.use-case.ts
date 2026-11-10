import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { csvCell } from '../../common/csv/csv-cell';
import { SettingsRepository } from '../../settings/domain/ports/settings.repository';
import { AuditFileRenderer, AuditFilters, AuditRepository } from '../domain/ports/audit.repository';

const columns = ['fecha', 'tipo', 'actor', 'nombre', 'acción', 'entidad', 'id', 'paciente', 'ip', 'resumen'];

// In-memory cap; streaming if the audit grows larger.
const maxRows = 50_000;
// A PDF of this size is already long to read, and laying it out holds the server: Excel is the format for everything.
const maxPdfRows = 2_000;

interface ExportContext {
  filters: AuditFilters;
  actorId: string;
  ip?: string;
}

// Spec 109: export with the same filter as the query, as CSV, Excel or PDF. The export is also audited.
@Injectable()
export class ExportAuditUseCase {
  constructor(
    private readonly audit: AuditRepository,
    private readonly log: AuthAuditLog,
    private readonly files: AuditFileRenderer,
    private readonly settings: SettingsRepository,
  ) {}

  async csv(context: ExportContext) {
    const rows = await this.audit.all(context.filters, maxRows);
    await this.record(context, 'csv', rows.length);
    const lines = rows.map((r) =>
      [r.createdAt.toISOString(), r.actorType, r.actorId, r.actorName, r.action, r.entity, r.entityId, r.patientCode, r.ip, r.summary]
        .map(csvCell)
        .join(','),
    );
    return '﻿' + [columns.join(','), ...lines].join('\n'); // BOM: Excel opens accents correctly
  }

  async xlsx(context: ExportContext) {
    const rows = await this.audit.all(context.filters, maxRows);
    await this.record(context, 'xlsx', rows.length);
    return this.files.xlsx(rows);
  }

  async pdf(context: ExportContext) {
    const [rows, { centerName }] = await Promise.all([this.audit.all(context.filters, maxRows), this.settings.get()]);
    await this.record(context, 'pdf', rows.length);
    return this.files.pdf({ records: rows.slice(0, maxPdfRows), total: rows.length, centerName, generatedAt: new Date() });
  }

  private record({ filters, actorId, ip }: ExportContext, format: string, rows: number) {
    return this.log.record({
      action: 'AUDIT_EXPORT',
      actorType: 'USER',
      actorId,
      entity: 'AuditLog',
      ip,
      summary: { filters, rows, format },
    });
  }
}
