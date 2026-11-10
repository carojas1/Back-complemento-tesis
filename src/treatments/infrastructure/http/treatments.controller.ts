import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role, type AuthenticatedUser } from '../../../auth';
import { GetTreatmentPlanUseCase } from '../../application/get-treatment-plan.use-case';
import { ListTreatmentProgressUseCase } from '../../application/list-treatment-progress.use-case';
import { SaveTreatmentPlanUseCase } from '../../application/save-treatment-plan.use-case';
import { SaveTreatmentPlanDto, TreatmentProgressQuery } from './treatments.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('treatments')
@Controller()
export class TreatmentsController {
  constructor(
    private readonly listProgress: ListTreatmentProgressUseCase,
    private readonly getPlan: GetTreatmentPlanUseCase,
    private readonly savePlan: SaveTreatmentPlanUseCase,
  ) {}

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('treatment-progress')
  @ApiOperation({ summary: 'Prescribed and completed sessions, next appointment and professional of each patient (paginated)' })
  progress(@Query() { search, therapistId, specialty, status, page, limit }: TreatmentProgressQuery, @GetUser() user: AuthenticatedUser) {
    return this.listProgress.execute({ search, therapistId, specialty, status }, { page, limit }, user);
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('patients/:id/treatment-plan')
  @ApiOperation({ summary: 'Prescribed sessions of a patient; null if there is no plan yet' })
  plan(@Param('id', uuid) id: string, @GetUser() user: AuthenticatedUser) {
    return this.getPlan.execute(id, user);
  }

  @Auth(Role.THERAPIST)
  @Put('patients/:id/treatment-plan')
  @ApiOperation({ summary: 'Prescribes the sessions of a patient (their specialist only)' })
  save(@Param('id', uuid) id: string, @Body() dto: SaveTreatmentPlanDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.savePlan.execute(id, dto, { id: actorId, ip: req.ip });
  }
}
