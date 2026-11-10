import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { JobsUseCases } from '../../application/jobs.use-cases';
import { JobResponse, ReportJobQuery } from './jobs.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Heavy documents in the background (specs 107 and 110): requested with 202 + id and the status is queried with that id.
// On completion, `downloadUrl` is a signed bucket URL (constitution §2), with no token of its own in the path.
@ApiTags('jobs')
@Auth(Role.THERAPIST)
@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsUseCases) {}

  @Post('patients/:patientId/reports/pdf-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enqueues the period report PDF (spec 107/108); an identical request in progress returns the same job' })
  @ApiAcceptedResponse({ type: JobResponse })
  reportPdf(@Param('patientId', uuid) patientId: string, @Query() q: ReportJobQuery, @GetUser('id') userId: string, @Req() req: Request) {
    return this.jobs.enqueue('REPORT_PDF', patientId, { from: q.from, to: q.to }, { userId, ip: req.ip });
  }

  @Post('patients/:patientId/export-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enqueues the data copy as a ZIP (spec 110, right of access)' })
  @ApiAcceptedResponse({ type: JobResponse })
  exportZip(@Param('patientId', uuid) patientId: string, @GetUser('id') userId: string, @Req() req: Request) {
    return this.jobs.enqueue('EXPORT_ZIP', patientId, {}, { userId, ip: req.ip });
  }

  @Get('jobs')
  @ApiOperation({ summary: 'My jobs, newest to oldest' })
  list(@Query() q: PaginationQuery, @GetUser('id') userId: string) {
    return this.jobs.list(userId, q);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Status of one of my own jobs: queue position, error or download URL' })
  @ApiOkResponse({ type: JobResponse })
  get(@Param('id', uuid) id: string, @GetUser('id') userId: string) {
    return this.jobs.get(id, userId);
  }

  @Delete('jobs/:id')
  @ApiOperation({ summary: 'Cancels one of my own jobs that is still queued' })
  @ApiOkResponse({ type: JobResponse })
  cancel(@Param('id', uuid) id: string, @GetUser('id') userId: string) {
    return this.jobs.cancel(id, userId);
  }
}
