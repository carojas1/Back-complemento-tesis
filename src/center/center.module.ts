import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { CreateRoomUseCase } from './application/create-room.use-case';
import { GetCenterHoursUseCase } from './application/get-center-hours.use-case';
import { ListRoomsUseCase } from './application/list-rooms.use-case';
import { ReplaceCenterHoursUseCase } from './application/replace-center-hours.use-case';
import { UpdateRoomUseCase } from './application/update-room.use-case';
import { CenterRepository } from './domain/ports/center.repository';
import { CenterController } from './infrastructure/http/center.controller';
import { CenterPrismaRepository } from './infrastructure/prisma/center.prisma.repository';

// Rooms and opening hours of each center. AuthModule provides AuthAuditLog.
@Module({
  imports: [AuthModule],
  controllers: [CenterController],
  providers: [
    { provide: CenterRepository, useClass: CenterPrismaRepository },
    ListRoomsUseCase,
    CreateRoomUseCase,
    UpdateRoomUseCase,
    GetCenterHoursUseCase,
    ReplaceCenterHoursUseCase,
  ],
})
export class CenterModule {}
