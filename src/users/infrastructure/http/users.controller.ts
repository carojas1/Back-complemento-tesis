import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { User } from '../../../auth/domain/entities/user.entity';
import { AssignTemporaryPasswordUseCase } from '../../application/assign-temporary-password.use-case';
import { ClearPinUseCase } from '../../application/clear-pin.use-case';
import { CreateAccountUseCase } from '../../application/create-account.use-case';
import { GetAssignedPatientsUseCase } from '../../application/get-assigned-patients.use-case';
import { ListUsersUseCase } from '../../application/list-users.use-case';
import { ReplaceAssignedPatientsUseCase } from '../../application/replace-assigned-patients.use-case';
import { UpdateUserUseCase } from '../../application/update-user.use-case';
import { mapPage } from '../../../common/pagination/page';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { CreateAccountDto, ListUsersQuery, ReplacePatientsDto, TemporaryPasswordDto, UpdateUserDto } from './users.dto';

// Response mapper: the password hash never goes out.
const toUserResponse = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  specialty: user.specialty,
  active: user.active,
  mustChangePassword: user.mustChangePassword,
  hasPin: user.hasPin(),
  createdAt: user.createdAt,
});

const uuid = new ParseUUIDPipe({ version: '4' });

// Spec 102: everything belongs to the admin.
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly createAccount: CreateAccountUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly assignTemporaryPassword: AssignTemporaryPasswordUseCase,
    private readonly clearPin: ClearPinUseCase,
    private readonly getAssignedPatients: GetAssignedPatientsUseCase,
    private readonly replaceAssignedPatients: ReplaceAssignedPatientsUseCase,
  ) {}

  @Auth(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Lists users, filtered by role and status' })
  async list(@Query() { role, active, page, limit }: ListUsersQuery) {
    return mapPage(await this.listUsers.execute({ role, active }, { page, limit }), toUserResponse);
  }

  @Auth(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Creates a therapist or a guardian with a temporary password (must be changed on first login)' })
  async create(@Body() dto: CreateAccountDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return toUserResponse(await this.createAccount.execute({ ...dto, actorId, ip: req.ip }));
  }

  @Auth(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Changes name, e-mail or status. active=false deactivates (not deleted) and closes their sessions' })
  async update(@Param('id', uuid) id: string, @Body() dto: UpdateUserDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return toUserResponse(await this.updateUser.execute({ ...dto, id, actorId, ip: req.ip }));
  }

  @Auth(Role.ADMIN)
  @Delete(':id/pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Clears the therapist's tablet PIN (spec 002): she must create another from her account" })
  async deletePin(@Param('id', uuid) id: string, @GetUser('id') actorId: string, @Req() req: Request) {
    await this.clearPin.execute({ id, actorId, ip: req.ip });
  }

  @Auth(Role.ADMIN)
  @Post(':id/temporary-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Assigns another temporary password and closes the user's sessions" })
  async temporaryPassword(
    @Param('id', uuid) id: string,
    @Body() dto: TemporaryPasswordDto,
    @GetUser('id') actorId: string,
    @Req() req: Request,
  ) {
    await this.assignTemporaryPassword.execute({ ...dto, id, actorId, ip: req.ip });
  }

  @Auth(Role.ADMIN)
  @Get(':id/patients')
  @ApiOperation({ summary: 'Assigned patients (code and avatar only, no clinical data)' })
  patients(@Param('id', uuid) id: string, @Query() { page, limit }: PaginationQuery) {
    return this.getAssignedPatients.execute(id, { page, limit });
  }

  @Auth(Role.ADMIN)
  @Put(':id/patients')
  @ApiOperation({ summary: "Replaces the therapist's list of assigned patients" })
  replacePatients(@Param('id', uuid) id: string, @Body() dto: ReplacePatientsDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.replaceAssignedPatients.execute({ id, patientIds: dto.patientIds, actorId, ip: req.ip });
  }
}
