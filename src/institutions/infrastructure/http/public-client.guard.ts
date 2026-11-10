import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppKeyGuard } from '../../../devices/infrastructure/http/device-auth';

// "Request an account" opens to the mobile app (X-App-Key) and to the web (an Origin from CORS_ORIGINS or WEB_URL). Like the
// app key, the Origin only filters foreign clients; the real protection is the rate limit and the manual review.
@Injectable()
export class PublicClientGuard implements CanActivate {
  private readonly origins: Set<string>;

  constructor(
    private readonly appKey: AppKeyGuard,
    config: ConfigService,
  ) {
    const listed = config.get<string>('CORS_ORIGINS', 'http://localhost:5173').split(',');
    const web = config.get<string>('WEB_URL');
    this.origins = new Set([...listed, ...(web ? [new URL(web).origin] : [])].map((o) => o.trim()).filter(Boolean));
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.headers['x-app-key'] && this.origins.has(String(req.headers.origin ?? ''))) return true;
    return this.appKey.canActivate(context); // throws InvalidAppKey
  }
}
