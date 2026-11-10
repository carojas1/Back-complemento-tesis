import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { CreateRoomUseCase } from '../../application/create-room.use-case';
import { GetCenterHoursUseCase } from '../../application/get-center-hours.use-case';
import { ListRoomsUseCase } from '../../application/list-rooms.use-case';
import { ReplaceCenterHoursUseCase } from '../../application/replace-center-hours.use-case';
import { UpdateRoomUseCase } from '../../application/update-room.use-case';
import { CreateRoomDto, ListRoomsQuery, ReplaceCenterHoursDto, UpdateRoomDto } from './center.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Rooms and opening hours: the admin configures them; specialists read them to book.
@ApiTags('center')
@Controller()
export class CenterController {
  constructor(
    private readonly listRooms: ListRoomsUseCase,
    private readonly createRoom: CreateRoomUseCase,
    private readonly updateRoom: UpdateRoomUseCase,
    private readonly getHours: GetCenterHoursUseCase,
    private readonly replaceHours: ReplaceCenterHoursUseCase,
  ) {}

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('rooms')
  @ApiOperation({ summary: 'Rooms of the center (paginated)' })
  rooms(@Query() { active, page, limit }: ListRoomsQuery) {
    return this.listRooms.execute(active ?? false, { page, limit });
  }

  @Auth(Role.ADMIN)
  @Post('rooms')
  @ApiOperation({ summary: 'Crea un consultorio' })
  create(@Body() dto: CreateRoomDto, @GetUser('id') id: string, @Req() req: Request) {
    return this.createRoom.execute(dto.name, { id, ip: req.ip });
  }

  @Auth(Role.ADMIN)
  @Patch('rooms/:id')
  @ApiOperation({ summary: 'Renombra o desactiva un consultorio' })
  update(@Param('id', uuid) roomId: string, @Body() { name, active }: UpdateRoomDto, @GetUser('id') id: string, @Req() req: Request) {
    return this.updateRoom.execute(roomId, Object.fromEntries(Object.entries({ name, active }).filter(([, v]) => v !== undefined)), {
      id,
      ip: req.ip,
    });
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('center-hours')
  @ApiOperation({ summary: 'Opening hours of the center' })
  hours() {
    return this.getHours.execute();
  }

  @Auth(Role.ADMIN)
  @Put('center-hours')
  @ApiOperation({ summary: 'Replaces the hours for the whole week; a day that does not appear is closed' })
  setHours(@Body() { hours }: ReplaceCenterHoursDto, @GetUser('id') id: string, @Req() req: Request) {
    return this.replaceHours.execute(hours, { id, ip: req.ip });
  }
}
