import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Device } from '../../../devices/domain/entities/device.entity';
import { DeviceAuth, GetDevice } from '../../../devices/infrastructure/http/device-auth';
import { GetSyncProfilesUseCase } from '../../application/get-sync-profiles.use-case';
import { ProcessBatchUseCase } from '../../application/process-batch.use-case';
import { SyncBatchDto, SyncProfilesQuery } from './sync.dto';

// Spec 106: the tablets' entry point. Offline, the tablet saves and sends in batches; online, it also goes live over /ws.
@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly getProfiles: GetSyncProfilesUseCase,
    private readonly processBatch: ProcessBatchUseCase,
  ) {}

  @DeviceAuth()
  @Throttle({ long: { limit: 60, ttl: 60_000 } }) // FR-004: 60 per minute
  @Get('profiles')
  @ApiOperation({ summary: 'Tablet: profiles changed since ?since= (paginated), discharged codes and current version' })
  profiles(@Query() { since, page, limit }: SyncProfilesQuery) {
    return this.getProfiles.execute(since, { page, limit });
  }

  @DeviceAuth()
  @Throttle({ long: { limit: 60, ttl: 60_000 } })
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tablet: sessions, events and results (max. 100). Idempotent: returns the accepted UUIDs' })
  batch(@Body() dto: SyncBatchDto, @GetDevice() device: Device) {
    return this.processBatch.execute({ deviceId: device.id }, dto);
  }
}
