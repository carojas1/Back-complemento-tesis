import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { HomeworkUseCases } from '../../application/homework.use-cases';
import { CreateHomeworkDto, HomeworkQuery, UpdateHomeworkDto } from './homework.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Spec 112: home review homework; therapists assigned to the patient only.
@ApiTags('homework')
@Controller()
export class HomeworkController {
  constructor(private readonly homework: HomeworkUseCases) {}

  @Auth(Role.THERAPIST)
  @Get('patients/:patientId/homework')
  @ApiOperation({ summary: 'Patient homework, newest to oldest (status: pending or done)' })
  list(@Param('patientId', uuid) patientId: string, @Query() q: HomeworkQuery, @GetUser('id') therapistId: string) {
    return this.homework.list(patientId, q.status, q, { therapistId });
  }

  @Auth(Role.THERAPIST)
  @Post('patients/:patientId/homework')
  @ApiOperation({ summary: 'New homework: instruction, board pictograms, due date and, optionally, the «identificar» activity' })
  create(
    @Param('patientId', uuid) patientId: string,
    @Body() dto: CreateHomeworkDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.homework.create(patientId, dto, { therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Patch('homework/:id')
  @ApiOperation({ summary: 'Changes a homework item that is not done yet' })
  update(@Param('id', uuid) id: string, @Body() dto: UpdateHomeworkDto, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.homework.update(id, dto, { therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Delete('homework/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletes a homework item that is not done yet' })
  async remove(@Param('id', uuid) id: string, @GetUser('id') therapistId: string, @Req() req: Request) {
    await this.homework.remove(id, { therapistId, ip: req.ip });
  }
}
