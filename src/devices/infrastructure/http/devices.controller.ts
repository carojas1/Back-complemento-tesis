import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Auth, GetUser, Public, Role } from '../../../auth';
import { mapPage } from '../../../common/pagination/page';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { CreateRegistrationCodeUseCase } from '../../application/create-registration-code.use-case';
import { ListDevicesUseCase } from '../../application/list-devices.use-case';
import { RegisterDeviceUseCase } from '../../application/register-device.use-case';
import { RevokeDeviceUseCase } from '../../application/revoke-device.use-case';
import { Device } from '../../domain/entities/device.entity';
import { DeviceListItem } from '../../domain/ports/devices.repository';
import { AppKeyGuard, DeviceAuth, GetDevice } from './device-auth';
import { GetSettingsUseCase } from '../../../settings/application/get-settings.use-case';
import { CreateRegistrationCodeDto, RegisterDeviceDto } from './devices.dto';

// Response mapper: the token hash and the public key never go out.
const toDeviceResponse = ({ device, authorizedBy }: DeviceListItem, now: Date) => ({
  id: device.id,
  name: device.name,
  model: device.model,
  appVersion: device.appVersion,
  registeredAt: device.registeredAt,
  lastSeenAt: device.lastSeenAt,
  lastSyncAt: device.lastSyncAt,
  revokedAt: device.revokedAt,
  stale: !device.isRevoked() && device.isStale(now),
  authorizedBy,
});

const uuid = new ParseUUIDPipe({ version: '4' });

// Spec 103 (API) and 001 (contract with the tablet).
@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly createRegistrationCode: CreateRegistrationCodeUseCase,
    private readonly registerDevice: RegisterDeviceUseCase,
    private readonly listDevices: ListDevicesUseCase,
    private readonly revokeDevice: RevokeDeviceUseCase,
    private readonly getSettings: GetSettingsUseCase,
  ) {}

  @Auth(Role.ADMIN)
  @Post('registration-codes')
  @Throttle({ medium: { limit: 5, ttl: 60_000 } }) // the Center PIN cannot be guessed by brute force
  @ApiOperation({ summary: 'Generates a single-use 8-character code; requires the current Center PIN' })
  createCode(@Body() dto: CreateRegistrationCodeDto, @GetUser('id') adminId: string, @Req() req: Request) {
    return this.createRegistrationCode.execute({ adminId, centerPin: dto.centerPin, ip: req.ip });
  }

  @Public()
  @UseGuards(AppKeyGuard)
  @Throttle({ long: { limit: 10, ttl: 15 * 60_000 } }) // FR-002: 10 attempts per IP every 15 minutes
  @Post('register')
  @ApiOperation({ summary: 'The tablet exchanges the code for its token (requires X-App-Key)' })
  register(@Body() dto: RegisterDeviceDto, @Req() req: Request) {
    return this.registerDevice.execute({ ...dto, ip: req.ip });
  }

  @Auth(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Registered tablets, with last connection and sync' })
  async list(@Query() { page, limit }: PaginationQuery) {
    const now = new Date();
    return mapPage(await this.listDevices.execute({ page, limit }), (item) => toDeviceResponse(item, now));
  }

  @Auth(Role.ADMIN)
  @Post(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revokes the tablet: its token stops working immediately' })
  async revoke(@Param('id', uuid) id: string, @GetUser('id') adminId: string, @Req() req: Request) {
    await this.revokeDevice.execute({ id, adminId, ip: req.ip });
  }

  @DeviceAuth()
  @Get('settings')
  @ApiOperation({ summary: 'Center settings for the tablet: name, hashed Center PIN and therapist-mode inactivity' })
  settings() {
    return this.getSettings.forDevice();
  }

  @DeviceAuth()
  @Get('me')
  @ApiOperation({ summary: 'The tablet checks that its token is still valid' })
  me(@GetDevice() device: Device) {
    return { deviceId: device.id, name: device.name };
  }
}
