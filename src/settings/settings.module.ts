import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { GetSettingsUseCase } from './application/get-settings.use-case';
import { SetCenterLogoUseCase } from './application/set-center-logo.use-case';
import { SetCenterPinUseCase } from './application/set-center-pin.use-case';
import { UpdateSettingsUseCase } from './application/update-settings.use-case';
import { CenterPinHasher, SettingsRepository } from './domain/ports/settings.repository';
import { SettingsController } from './infrastructure/http/settings.controller';
import { SettingsPrismaRepository } from './infrastructure/prisma/settings.prisma.repository';
import { Pbkdf2CenterPinHasher } from './infrastructure/security/pbkdf2-center-pin.hasher';

// Center settings (spec 103 FR-008). `devices` uses it for the registration code and for what the tablet downloads.
@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [
    { provide: SettingsRepository, useClass: SettingsPrismaRepository },
    { provide: CenterPinHasher, useClass: Pbkdf2CenterPinHasher },
    GetSettingsUseCase,
    UpdateSettingsUseCase,
    SetCenterPinUseCase,
    SetCenterLogoUseCase,
  ],
  exports: [SettingsRepository, CenterPinHasher, GetSettingsUseCase],
})
export class SettingsModule {}
