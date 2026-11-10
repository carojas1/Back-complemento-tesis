import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import type { AuthenticatedUser } from '../../../auth';
import { CompleteRectificationUseCase } from '../../application/complete-rectification.use-case';
import { CreateDataRequestUseCase } from '../../application/create-data-request.use-case';
import { ExecuteDeletionUseCase } from '../../application/execute-deletion.use-case';
import { ListDataRequestsUseCase } from '../../application/list-data-requests.use-case';
import { RejectDataRequestUseCase } from '../../application/reject-data-request.use-case';
import { CreateDataRequestDto, DataRequestNotesDto, DataRequestResponse, DataRequestsQuery, ExecuteDeletionDto } from './data-requests.dto';

const uuid = new ParseUUIDPipe({ version: '4' });
const actor = (user: AuthenticatedUser, req: Request) => ({ userId: user.id, name: user.name, ip: req.ip });

// Spec 110 (LOPDP): access, rectification and deletion requests, with double confirmation for rectification and deletion (the copy ZIP goes through the queue: jobs module).
@ApiTags('data-requests')
@Controller()
export class DataRequestsController {
  constructor(
    private readonly create: CreateDataRequestUseCase,
    private readonly listRequests: ListDataRequestsUseCase,
    private readonly rectify: CompleteRectificationUseCase,
    private readonly rejectRequest: RejectDataRequestUseCase,
    private readonly deletion: ExecuteDeletionUseCase,
  ) {}

  @Auth(Role.THERAPIST)
  @Post('patients/:patientId/data-requests')
  @ApiOperation({ summary: 'Registers a guardian request (access, rectification or deletion); 15-day deadline' })
  @ApiOkResponse({ type: DataRequestResponse })
  createRequest(
    @Param('patientId', uuid) patientId: string,
    @Body() dto: CreateDataRequestDto,
    @GetUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.create.execute(patientId, dto, actor(user, req));
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('data-requests')
  @ApiOperation({ summary: 'Requests (admin: all; therapist: those of their patients), with due date and deadline status' })
  @ApiOkResponse({ type: [DataRequestResponse], description: 'Page { items, page, limit, total, totalPages }' })
  list(@Query() q: DataRequestsQuery, @GetUser() user: AuthenticatedUser) {
    return this.listRequests.execute({ status: q.status, type: q.type }, q, user);
  }

  @Auth(Role.THERAPIST)
  @Post('data-requests/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Closes a rectification with the reason and what was corrected (the record is corrected with PATCH /patients/:id)',
  })
  @ApiOkResponse({ type: DataRequestResponse })
  complete(@Param('id', uuid) id: string, @Body() dto: DataRequestNotesDto, @GetUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.rectify.execute(id, dto.notes, actor(user, req));
  }

  @Auth(Role.ADMIN)
  @Post('data-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rejects an open request with a reason' })
  @ApiOkResponse({ type: DataRequestResponse })
  reject(@Param('id', uuid) id: string, @Body() dto: DataRequestNotesDto, @GetUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.rejectRequest.execute(id, dto.notes, actor(user, req));
  }

  @Auth(Role.ADMIN)
  @Post('data-requests/:id/execute-deletion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deletes the patient (confirmCode = their code); anonymous sessions only with authorized statistical use' })
  @ApiOkResponse({ type: DataRequestResponse })
  executeDeletion(@Param('id', uuid) id: string, @Body() dto: ExecuteDeletionDto, @GetUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.deletion.execute(id, dto.confirmCode, actor(user, req));
  }
}
