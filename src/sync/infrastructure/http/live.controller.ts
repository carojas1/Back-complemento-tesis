import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, GetUser, Role } from '../../../auth';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { ListLivePatientsUseCase } from '../../application/list-live-patients.use-case';

// Web live panel (spec 106 FR-005): initial load; after that the changes arrive over the WebSocket (`presence`).
@ApiTags('live')
@Controller('live')
export class LiveController {
  constructor(private readonly listLive: ListLivePatientsUseCase) {}

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('patients')
  @ApiOperation({ summary: 'Patients with their live status (ONLINE, AWAY, OFFLINE) and the open session; no names' })
  patients(@Query() page: PaginationQuery, @GetUser('id') userId: string, @GetUser('role') role: Role) {
    return this.listLive.execute({ userId, isAdmin: role === Role.ADMIN }, page);
  }
}
