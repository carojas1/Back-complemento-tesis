import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../../../auth';
import { AuthenticateDeviceUseCase } from '../../application/authenticate-device.use-case';
import { Device } from '../../domain/entities/device.entity';
import { InvalidAppKey } from '../../domain/exceptions/devices.exceptions';

type DeviceRequest = Request & { device?: Device };

// "Mobile app CORS" (spec 103 FR-006): CORS is only enforced by the browser, so the native app
// identifies itself with X-App-Key. It ships inside the APK: it filters foreign clients, the real security is the token + the signature.
@Injectable()
export class AppKeyGuard implements CanActivate {
  private readonly appKey: Buffer;

  constructor(config: ConfigService) {
    this.appKey = Buffer.from(config.getOrThrow<string>('APP_KEY'));
  }

  canActivate(context: ExecutionContext) {
    const sent = Buffer.from(String(context.switchToHttp().getRequest<Request>().headers['x-app-key'] ?? ''));
    if (sent.length !== this.appKey.length || !timingSafeEqual(sent, this.appKey)) throw new InvalidAppKey();
    return true;
  }
}

// Device token + signature with the Keystore key (spec 103 FR-005). Leaves the tablet in req.device.
@Injectable()
export class DeviceTokenGuard implements CanActivate {
  constructor(private readonly authenticate: AuthenticateDeviceUseCase) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<DeviceRequest>();
    const header = (name: string) => req.header(name) ?? undefined;
    const authorization = header('authorization');

    req.device = await this.authenticate.execute({
      token: authorization?.startsWith('Device ') ? authorization.slice(7) : undefined,
      timestamp: header('x-device-timestamp'),
      signature: header('x-device-signature'),
      method: req.method,
      path: req.originalUrl,
    });
    return true;
  }
}

// Tablet routes: they do not use the user session (hence @Public for the JWT and role guards),
// but X-App-Key + `Authorization: Device <token>` + signature.
// Marks the tablet's routes: only there does the rate limit count by device token.
export const deviceRouteKey = 'necon:deviceRoute';

export const DeviceAuth = () =>
  applyDecorators(
    SetMetadata(deviceRouteKey, true),
    Public(),
    UseGuards(AppKeyGuard, DeviceTokenGuard),
    ApiHeader({ name: 'X-App-Key', required: true }),
    ApiHeader({ name: 'Authorization', description: 'Device <token>', required: true }),
    ApiHeader({ name: 'X-Device-Timestamp', description: 'Epoch in ms', required: true }),
    ApiHeader({ name: 'X-Device-Signature', description: 'ECDSA P-256 (base64) of `METHOD\\npath\\ntimestamp`', required: true }),
    ApiUnauthorizedResponse({ description: 'Tableta no autorizada' }),
  );

export const GetDevice = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<DeviceRequest>().device);
