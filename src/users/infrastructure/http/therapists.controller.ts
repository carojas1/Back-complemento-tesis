import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { Device } from '../../../devices/domain/entities/device.entity';
import { DeviceAuth, GetDevice } from '../../../devices/infrastructure/http/device-auth';
import { CheckTherapistPinUseCase } from '../../application/check-therapist-pin.use-case';
import { ListTabletTherapistsUseCase } from '../../application/list-tablet-therapists.use-case';
import { CheckPinDto } from './users.dto';

// Tablet routes (spec 002): choose a therapist and verify their personal PIN. No JWT: X-App-Key + token + signature.
@ApiTags('therapists')
@Controller('therapists')
export class TherapistsController {
  constructor(
    private readonly listTabletTherapists: ListTabletTherapistsUseCase,
    private readonly checkTherapistPin: CheckTherapistPinUseCase,
  ) {}

  @DeviceAuth()
  @Get()
  @ApiOperation({ summary: 'Tableta: terapeutas activas (id, nombre, hasPin), paginadas' })
  list(@Query() { page, limit }: PaginationQuery) {
    return this.listTabletTherapists.execute({ page, limit });
  }

  @DeviceAuth()
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @Post(':id/pin-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Tablet: verifies the therapist's PIN (5 failures = 60 s lock; 10 = PIN voided)" })
  check(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CheckPinDto,
    @GetDevice() device: Device,
    @Req() req: Request,
  ) {
    return this.checkTherapistPin.execute({ therapistId: id, pin: dto.pin, deviceId: device.id, ip: req.ip });
  }
}
