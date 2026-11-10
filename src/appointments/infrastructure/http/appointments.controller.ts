import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role, type AuthenticatedUser } from '../../../auth';
import { BookAppointmentUseCase } from '../../application/book-appointment.use-case';
import { CloseAppointmentUseCase } from '../../application/close-appointment.use-case';
import { GetAppointmentUseCase } from '../../application/get-appointment.use-case';
import { ListAppointmentsUseCase } from '../../application/list-appointments.use-case';
import { RescheduleAppointmentUseCase } from '../../application/reschedule-appointment.use-case';
import { BookAppointmentDto, CloseAppointmentDto, ListAppointmentsQuery, RescheduleAppointmentDto } from './appointments.dto';

const uuid = new ParseUUIDPipe({ version: '4' });
const actorOf = (user: AuthenticatedUser, req: Request) => ({ id: user.id, role: user.role, ip: req.ip });

// Center agenda, the same in both panels: the admin handles every appointment and a specialist, their own (the rules live in the
// use cases).
@ApiTags('appointments')
@Auth(Role.ADMIN, Role.THERAPIST)
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly listAppointments: ListAppointmentsUseCase,
    private readonly getAppointment: GetAppointmentUseCase,
    private readonly bookAppointment: BookAppointmentUseCase,
    private readonly rescheduleAppointment: RescheduleAppointmentUseCase,
    private readonly closeAppointment: CloseAppointmentUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Appointments by date range, therapist, patient or status (by start time, paginated)' })
  list(
    @Query() { from, to, therapistId, patientId, status, specialty, roomId, page, limit }: ListAppointmentsQuery,
    @GetUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.listAppointments.execute(
      { from, to, therapistId, patientId, status, specialty, roomId },
      { page, limit },
      actorOf(user, req),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'One appointment' })
  get(@Param('id', uuid) id: string, @GetUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.getAppointment.execute(id, actorOf(user, req));
  }

  @Post()
  @ApiOperation({ summary: 'Schedules an appointment; the patient must be assigned to the specialist and all must be free at that time' })
  book(@Body() dto: BookAppointmentDto, @GetUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.bookAppointment.execute(dto, actorOf(user, req));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Moves, reassigns or edits a scheduled appointment' })
  reschedule(
    @Param('id', uuid) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @GetUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const { therapistId, startsAt, endsAt, roomId, notes } = dto;
    const changes = Object.fromEntries(Object.entries({ therapistId, startsAt, endsAt, roomId, notes }).filter(([, v]) => v !== undefined));
    return this.rescheduleAppointment.execute(id, changes, actorOf(user, req));
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Closes an appointment as done, cancelled or no-show' })
  close(@Param('id', uuid) id: string, @Body() dto: CloseAppointmentDto, @GetUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.closeAppointment.execute(id, dto.status, actorOf(user, req));
  }
}
