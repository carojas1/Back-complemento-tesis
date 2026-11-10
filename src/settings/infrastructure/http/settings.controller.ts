import { Body, Controller, Delete, Get, Patch, Put, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { GetSettingsUseCase } from '../../application/get-settings.use-case';
import { maxLogoBytes, SetCenterLogoUseCase } from '../../application/set-center-logo.use-case';
import { SetCenterPinUseCase } from '../../application/set-center-pin.use-case';
import { UpdateSettingsUseCase } from '../../application/update-settings.use-case';
import { SetCenterPinDto, UpdateSettingsDto } from './settings.dto';

// Center settings (spec 103 FR-008), admin only. Tablets download them with GET /devices/settings.
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly getSettings: GetSettingsUseCase,
    private readonly updateSettings: UpdateSettingsUseCase,
    private readonly setCenterPin: SetCenterPinUseCase,
    private readonly setCenterLogo: SetCenterLogoUseCase,
  ) {}

  @Auth(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Center name, whether a Center PIN exists, therapist-mode inactivity and code validity' })
  get() {
    return this.getSettings.forAdmin();
  }

  @Auth(Role.ADMIN)
  @Patch()
  @ApiOperation({ summary: 'Changes the Center name, the therapist-mode inactivity or the code validity' })
  update(@Body() dto: UpdateSettingsDto, @GetUser('id') adminId: string, @Req() req: Request) {
    return this.updateSettings.execute({ changes: dto, adminId, ip: req.ip });
  }

  @Auth(Role.ADMIN)
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  @Put('center-pin')
  @ApiOperation({ summary: 'Creates the Center PIN (one for all tablets) or changes it using the current one' })
  centerPin(@Body() dto: SetCenterPinDto, @GetUser('id') adminId: string, @Req() req: Request) {
    return this.setCenterPin.execute({ ...dto, adminId, ip: req.ip });
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get('branding')
  @ApiOperation({ summary: 'Center name and logo, for the staff menu' })
  branding() {
    return this.getSettings.branding();
  }

  @Auth(Role.ADMIN)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @Put('logo')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: maxLogoBytes, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Uploads or changes the Center logo (PNG or JPG, up to 500 KB and 2048 px per side)' })
  uploadLogo(@UploadedFile() logo: { buffer: Buffer } | undefined, @GetUser('id') adminId: string, @Req() req: Request) {
    return this.setCenterLogo.set({ image: logo?.buffer, adminId, ip: req.ip });
  }

  @Auth(Role.ADMIN)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @Delete('logo')
  @ApiOperation({ summary: 'Removes the Center logo' })
  removeLogo(@GetUser('id') adminId: string, @Req() req: Request) {
    return this.setCenterLogo.remove({ adminId, ip: req.ip });
  }
}
