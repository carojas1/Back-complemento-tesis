import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { AuthenticateDeviceUseCase } from './application/authenticate-device.use-case';
import { CreateRegistrationCodeUseCase } from './application/create-registration-code.use-case';
import { ListDevicesUseCase } from './application/list-devices.use-case';
import { RegisterDeviceUseCase } from './application/register-device.use-case';
import { RevokeDeviceUseCase } from './application/revoke-device.use-case';
import { SettingsModule } from '../settings/settings.module';
import { LimitsModule } from '../limits/limits.module';
import { DevicesRepository, SignatureVerifier } from './domain/ports/devices.repository';
import { AppKeyGuard, DeviceTokenGuard } from './infrastructure/http/device-auth';
import { DevicesController } from './infrastructure/http/devices.controller';
import { DevicesPrismaRepository } from './infrastructure/prisma/devices.prisma.repository';
import { EcdsaSignatureVerifier } from './infrastructure/security/ecdsa-signature.verifier';

// AuthModule provides TokenService (token and code hashing) and AuthAuditLog.
@Module({
  imports: [AuthModule, SettingsModule, LimitsModule],
  controllers: [DevicesController],
  providers: [
    { provide: DevicesRepository, useClass: DevicesPrismaRepository },
    { provide: SignatureVerifier, useClass: EcdsaSignatureVerifier },
    CreateRegistrationCodeUseCase,
    RegisterDeviceUseCase,
    ListDevicesUseCase,
    RevokeDeviceUseCase,
    AuthenticateDeviceUseCase,
    AppKeyGuard,
    DeviceTokenGuard,
  ],
  // So other modules can protect tablet routes with @DeviceAuth().
  exports: [AuthenticateDeviceUseCase, AppKeyGuard, DeviceTokenGuard, DevicesRepository],
})
export class DevicesModule {}
