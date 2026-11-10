import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { NotesUseCases } from '../../application/notes.use-cases';
import { CreateGoalDto, CreateNoteDto, EditNoteDto, NotesQuery, ShareNoteDto, UpdateGoalDto } from './notes.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Spec 108: observations (editable for 24 h by their author) and patient goals; assigned therapists only.
@ApiTags('notes')
@Controller()
export class NotesController {
  constructor(private readonly notes: NotesUseCases) {}

  @Auth(Role.THERAPIST)
  @Get('patients/:patientId/notes')
  @ApiOperation({ summary: 'Patient observations in chronological order, filterable by period' })
  listNotes(@Param('patientId', uuid) patientId: string, @Query() q: NotesQuery, @GetUser('id') therapistId: string) {
    return this.notes.listNotes(patientId, { from: q.from, to: q.to }, q, { therapistId });
  }

  @Auth(Role.THERAPIST)
  @Post('patients/:patientId/notes')
  @ApiOperation({ summary: 'New observation (about the patient or a session)' })
  createNote(
    @Param('patientId', uuid) patientId: string,
    @Body() dto: CreateNoteDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.notes.createNote(patientId, dto, { therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Patch('notes/:id')
  @ApiOperation({ summary: 'Edits your own observation within 24 h (the previous version stays in the audit)' })
  editNote(@Param('id', uuid) id: string, @Body() dto: EditNoteDto, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.notes.editNote(id, dto.text, { therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Patch('notes/:id/sharing')
  @ApiOperation({ summary: 'Shares (or stops sharing) an observation with the family; without the 24 h rule (spec 112)' })
  shareNote(@Param('id', uuid) id: string, @Body() dto: ShareNoteDto, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.notes.shareNote(id, dto.sharedWithFamily, { therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Get('patients/:patientId/goals')
  @ApiOperation({ summary: 'Patient goals' })
  listGoals(@Param('patientId', uuid) patientId: string, @Query() q: PaginationQuery, @GetUser('id') therapistId: string) {
    return this.notes.listGoals(patientId, q, { therapistId });
  }

  @Auth(Role.THERAPIST)
  @Post('patients/:patientId/goals')
  @ApiOperation({ summary: 'New goal with a target date; starts in progress' })
  createGoal(
    @Param('patientId', uuid) patientId: string,
    @Body() dto: CreateGoalDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.notes.createGoal(patientId, dto, { therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Patch('goals/:id')
  @ApiOperation({ summary: 'Changes the status (achieved, suspended, in progress), the text or the target date' })
  updateGoal(@Param('id', uuid) id: string, @Body() dto: UpdateGoalDto, @GetUser('id') therapistId: string, @Req() req: Request) {
    const { status, text, targetDate } = dto;
    return this.notes.updateGoal(id, { status, text, targetDate }, { therapistId, ip: req.ip });
  }
}
