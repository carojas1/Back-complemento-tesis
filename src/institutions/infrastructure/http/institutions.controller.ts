import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Auth, GetUser, Public, Role } from '../../../auth';
import { CreateInstitutionAdminUseCase } from '../../application/create-institution-admin.use-case';
import { GetInstitutionUseCase } from '../../application/get-institution.use-case';
import { GetPlatformDashboardUseCase } from '../../application/get-platform-dashboard.use-case';
import { PlatformUseCases } from '../../application/platform.use-cases';
import { RequestInstitutionUseCase } from '../../application/request-institution.use-case';
import { SaveRequestNotesUseCase } from '../../application/save-request-notes.use-case';
import { SetInstitutionStatusUseCase } from '../../application/set-institution-status.use-case';
import { StartRequestReviewUseCase } from '../../application/start-request-review.use-case';
import { UpdateInstitutionUseCase } from '../../application/update-institution.use-case';
// prettier-ignore
import { CreateInstitutionAdminDto, CreateInstitutionRequestDto, ListInstitutionsQuery, ListRequestsQuery, RejectRequestDto, ReviewNotesDto, SetInstitutionStatusDto, UpdateInstitutionDto } from './institutions.dto';
import { PublicClientGuard } from './public-client.guard';

const uuid = new ParseUUIDPipe({ version: '4' });

// "Request an account" (spec 113 FR-005): no session, from the app (X-App-Key) or the web (allowed Origin) and 5 per hour per IP.
@ApiTags('institutions')
@Controller('institution-requests')
export class InstitutionRequestsController {
  constructor(private readonly requestInstitution: RequestInstitutionUseCase) {}

  @Public()
  @UseGuards(PublicClientGuard)
  @Throttle({ long: { limit: 5, ttl: 60 * 60_000 } })
  @Post()
  @ApiHeader({ name: 'X-App-Key', required: false, description: 'Mobile app; the web is recognized by its Origin' })
  @ApiOperation({ summary: 'Requests an account for an institution; the super admin reviews it' })
  create(@Body() dto: CreateInstitutionRequestDto, @Req() req: Request) {
    return this.requestInstitution.execute({ ...dto, message: dto.message ?? null, ip: req.ip ?? null });
  }
}

// Super admin (FR-006): requests and institutions, never a center's data.
@ApiTags('platform')
@Auth(Role.SUPER_ADMIN)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformUseCases,
    private readonly getPlatformDashboard: GetPlatformDashboardUseCase,
    private readonly startRequestReview: StartRequestReviewUseCase,
    private readonly saveRequestNotes: SaveRequestNotesUseCase,
    private readonly getInstitution: GetInstitutionUseCase,
    private readonly updateInstitution: UpdateInstitutionUseCase,
    private readonly setInstitutionStatus: SetInstitutionStatusUseCase,
    private readonly createInstitutionAdmin: CreateInstitutionAdminUseCase,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: "Super admin home: requests, centers, totals and each center's activity" })
  dashboard() {
    return this.getPlatformDashboard.execute();
  }

  @Get('requests')
  @ApiOperation({ summary: 'Account requests, newest first (paginated, by status)' })
  listRequests(@Query() query: ListRequestsQuery) {
    return this.platform.listRequests(query.status, query);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'A request with the contact data (recorded in the audit)' })
  getRequest(@Param('id', uuid) id: string, @GetUser('id') reviewerId: string, @Req() req: Request) {
    return this.platform.getRequest(id, { reviewerId, ip: req.ip });
  }

  @Post('requests/:id/review')
  @ApiOperation({ summary: 'Marks the request as contacted (PENDING → IN_REVIEW) with the call notes' })
  startReview(@Param('id', uuid) id: string, @Body() dto: ReviewNotesDto, @GetUser('id') reviewerId: string, @Req() req: Request) {
    return this.startRequestReview.execute({ id, notes: dto.notes, reviewerId, ip: req.ip });
  }

  @Patch('requests/:id/notes')
  @ApiOperation({ summary: 'Replaces the review notes of an open request' })
  saveNotes(@Param('id', uuid) id: string, @Body() dto: ReviewNotesDto, @GetUser('id') reviewerId: string, @Req() req: Request) {
    return this.saveRequestNotes.execute({ id, notes: dto.notes, reviewerId, ip: req.ip });
  }

  @Post('requests/:id/approve')
  @ApiOperation({
    summary: 'Creates the institution, copies the base catalogs and its first admin (temporary password in the response and by e-mail)',
  })
  approve(@Param('id', uuid) id: string, @GetUser('id') reviewerId: string, @Req() req: Request) {
    return this.platform.approve(id, { reviewerId, ip: req.ip });
  }

  @Post('requests/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rejects the request with a reason' })
  async reject(@Param('id', uuid) id: string, @Body() dto: RejectRequestDto, @GetUser('id') reviewerId: string, @Req() req: Request) {
    await this.platform.reject(id, dto.reason, { reviewerId, ip: req.ip });
  }

  @Get('institutions')
  @ApiOperation({ summary: 'Platform institutions (paginated; searches by name, RUC or city)' })
  listInstitutions(@Query() { search, active, page, limit }: ListInstitutionsQuery) {
    return this.platform.listInstitutions({ search, active }, { page, limit });
  }

  @Get('institutions/:id')
  @ApiOperation({ summary: 'A center: profile, limits, admins and usage counts' })
  institutionDetail(@Param('id', uuid) id: string) {
    return this.getInstitution.execute(id);
  }

  @Patch('institutions/:id')
  @ApiOperation({ summary: "Edits a center's profile and limits" })
  update(@Param('id', uuid) id: string, @Body() dto: UpdateInstitutionDto, @GetUser('id') actorId: string, @Req() req: Request) {
    const changes = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    return this.updateInstitution.execute({ id, changes, actorId, ip: req.ip });
  }

  @Post('institutions/:id/status')
  @ApiOperation({ summary: 'Suspends (with a reason) or reactivates a center; takes effect from the next request' })
  setStatus(@Param('id', uuid) id: string, @Body() dto: SetInstitutionStatusDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.setInstitutionStatus.execute({
      id,
      active: dto.active,
      reason: dto.active ? null : (dto.reason ?? null),
      actorId,
      ip: req.ip,
    });
  }

  @Post('institutions/:id/admins')
  @ApiOperation({ summary: 'Creates another admin for the center (temporary password in the response and by e-mail)' })
  createAdmin(@Param('id', uuid) id: string, @Body() dto: CreateInstitutionAdminDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.createInstitutionAdmin.execute({ institutionId: id, name: dto.name, email: dto.email, actorId, ip: req.ip });
  }
}
