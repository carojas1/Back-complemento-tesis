import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { SyncBatchDto } from '../../../sync/infrastructure/http/sync.dto';
import { FamilyUseCases } from '../../application/family.use-cases';
import { FamilyHomeworkQuery, FamilySessionsQuery } from './family.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Spec 112: family mode. Guardians (PARENT) only and only their children; everything is read-only except home practice
// and "homework done".
@ApiTags('family')
@Controller('family')
export class FamilyController {
  constructor(private readonly family: FamilyUseCases) {}

  @Auth(Role.PARENT)
  @Get('patients')
  @ApiOperation({ summary: 'Children of the guardian' })
  children(@Query() page: PaginationQuery, @GetUser('id') guardianId: string) {
    return this.family.children(page, { guardianId });
  }

  @Auth(Role.PARENT)
  @Get('patients/:id')
  @ApiOperation({ summary: 'Basic information about the child' })
  child(@Param('id', uuid) id: string, @GetUser('id') guardianId: string, @Req() req: Request) {
    return this.family.child(id, { guardianId, ip: req.ip });
  }

  @Auth(Role.PARENT)
  @Get('patients/:id/profile')
  @ApiOperation({ summary: 'Board of the child (same format as the tablet) for practicing at home' })
  profile(@Param('id', uuid) id: string, @GetUser('id') guardianId: string) {
    return this.family.profile(id, { guardianId });
  }

  @Auth(Role.PARENT)
  @Get('patients/:id/sessions')
  @ApiOperation({ summary: 'Therapy and home practice sessions (kind), most recent first' })
  sessions(@Param('id', uuid) id: string, @Query() q: FamilySessionsQuery, @GetUser('id') guardianId: string) {
    return this.family.sessions(id, { from: q.from, to: q.to }, q, { guardianId });
  }

  @Auth(Role.PARENT)
  @Get('patients/:id/notes')
  @ApiOperation({ summary: 'Observations the therapist shared with the family' })
  notes(@Param('id', uuid) id: string, @Query() page: PaginationQuery, @GetUser('id') guardianId: string) {
    return this.family.notes(id, page, { guardianId });
  }

  @Auth(Role.PARENT)
  @Get('patients/:id/homework')
  @ApiOperation({ summary: 'Homework of the child (status: pending or done)' })
  homework(@Param('id', uuid) id: string, @Query() q: FamilyHomeworkQuery, @GetUser('id') guardianId: string) {
    return this.family.homeworkList(id, q.status, q, { guardianId });
  }

  @Auth(Role.PARENT)
  @Post('homework/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marks a homework item as done (idempotent)' })
  complete(@Param('id', uuid) id: string, @GetUser('id') guardianId: string, @Req() req: Request) {
    return this.family.completeHomework(id, { guardianId, ip: req.ip });
  }

  @Auth(Role.PARENT)
  @Throttle({ long: { limit: 60, ttl: 60_000 } })
  @Post('practice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Home practice: the same batch as the tablet (max. 100), with optional homeworkId per session' })
  practice(@Body() dto: SyncBatchDto, @GetUser('id') guardianId: string, @Req() req: Request) {
    return this.family.practice(dto, { guardianId, ip: req.ip });
  }
}
