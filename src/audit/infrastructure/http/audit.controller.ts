import { Controller, Get, Header, Param, Query, Req, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { ExportAuditUseCase } from '../../application/export-audit.use-case';
import { GetAuditRecordUseCase } from '../../application/get-audit-record.use-case';
import { ListAuditUseCase } from '../../application/list-audit.use-case';
import { AuditQuery } from './audit.dto';

const filtersOf = ({ actorId, action, patientCode, from, to }: AuditQuery) => ({ actorId, action, patientCode, from, to });

// Spec 109: audit query and export, admin only (agreed 2026-10-21).
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(
    private readonly listAudit: ListAuditUseCase,
    private readonly exportAudit: ExportAuditUseCase,
    private readonly getRecord: GetAuditRecordUseCase,
  ) {}

  @Auth(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Records filtered by user, action, patient code and dates; paginated' })
  list(@Query() query: AuditQuery) {
    return this.listAudit.execute(filtersOf(query), query);
  }

  @Auth(Role.ADMIN)
  @Get('csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="auditoria.csv"')
  @ApiOperation({ summary: 'Exports the filter result as CSV (also audited)' })
  csv(@Query() query: AuditQuery, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.exportAudit.csv({ filters: filtersOf(query), actorId, ip: req.ip });
  }

  @Auth(Role.ADMIN)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @Get('xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="auditoria.xlsx"')
  @ApiOperation({ summary: 'Exports the filter result as Excel (also audited)' })
  async xlsx(@Query() query: AuditQuery, @GetUser('id') actorId: string, @Req() req: Request) {
    return new StreamableFile(await this.exportAudit.xlsx({ filters: filtersOf(query), actorId, ip: req.ip }));
  }

  @Auth(Role.ADMIN)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @Get('pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="auditoria.pdf"')
  @ApiOperation({ summary: 'Exports the filter result as PDF, up to 2000 records (also audited)' })
  async pdf(@Query() query: AuditQuery, @GetUser('id') actorId: string, @Req() req: Request) {
    return new StreamableFile(await this.exportAudit.pdf({ filters: filtersOf(query), actorId, ip: req.ip }));
  }

  // After the formats so that 'csv', 'xlsx' or 'pdf' are not taken as an id.
  @Auth(Role.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Detail of a record: action, entity, who (name), IP, date and summary' })
  get(@Param('id') id: string) {
    return this.getRecord.execute(id);
  }
}
