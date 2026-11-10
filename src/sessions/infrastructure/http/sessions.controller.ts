import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDate, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { SessionsUseCases } from '../../application/sessions.use-cases';
import { CenterDayEnd, CenterDayStart } from '../../../common/time/center-day';

const uuid = new ParseUUIDPipe({ version: '4' });

export class PeriodQuery extends PaginationQuery {
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @CenterDayStart() @IsDate() from?: Date;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @CenterDayEnd() @IsDate() to?: Date;
}

// Spec 107: sessions, detail and indicators for the assigned therapist (the PDF goes through the queue: jobs module).
@ApiTags('sessions')
@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsUseCases) {}

  @Auth(Role.THERAPIST)
  @Get('patients/:patientId/sessions')
  @ApiOperation({ summary: 'Patient sessions with date, duration, pictograms tapped, phrases and correct answers' })
  list(@Param('patientId', uuid) patientId: string, @Query() q: PeriodQuery, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.sessions.list(patientId, { from: q.from, to: q.to }, q, { therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Get('sessions/:id')
  @ApiOperation({ summary: 'Detail: timeline of events and activity results' })
  get(@Param('id', uuid) id: string, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.sessions.get(id, { therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Get('patients/:patientId/reports')
  @ApiOperation({ summary: 'Period indicators (default: 30 days): sessions, minutes, words, average phrase, correct answers' })
  report(@Param('patientId', uuid) patientId: string, @Query() q: PeriodQuery, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.sessions.report(patientId, { from: q.from, to: q.to }, { therapistId, ip: req.ip });
  }
}
