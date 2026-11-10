import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PasswordChangeRequired } from '../../../domain/exceptions/auth.exceptions';
import { allowTemporaryPasswordKey } from '../auth.decorators';
import { isPublicKey } from '../auth.decorators';
import { rolesKey } from '../auth.decorators';
import { Role } from '../../../domain/entities/user.entity';
import { AuthenticatedUser } from '../jwt-payload.interface';

// Global, runs after JwtAuthGuard. Default deny: if the endpoint does not
// declare `@Auth(...)` or `@Public()`, it is rejected. With a pending
// temporary password only `@AllowTemporaryPassword()` routes pass.
@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(isPublicKey, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(rolesKey, targets);
    if (!roles) throw new ForbiddenException('Endpoint sin nivel de acceso declarado');

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenException('No tiene permiso');
    if (user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(allowTemporaryPasswordKey, targets))
      throw new PasswordChangeRequired();
    if (roles.length > 0 && !roles.includes(user.role)) throw new ForbiddenException('No tiene permiso');
    return true;
  }
}
