import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { isPublicKey } from '../auth.decorators';

// Global: every route requires a JWT except those marked @Public (constitution §3).
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(isPublicKey, [context.getHandler(), context.getClass()]);
    return isPublic || super.canActivate(context);
  }

  handleRequest<T>(err: unknown, user: T): T {
    if (err instanceof Error && !(err instanceof UnauthorizedException)) throw err;
    if (err || !user) throw new UnauthorizedException('Sesión no válida o vencida');
    return user;
  }
}
