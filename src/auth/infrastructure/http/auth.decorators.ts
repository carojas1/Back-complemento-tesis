import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Role } from '../../domain/entities/user.entity';
import { AuthenticatedUser } from './jwt-payload.interface';

// Metadata read by the global guards (JwtAuthGuard and UserRoleGuard).
export const isPublicKey = 'isPublic';
export const rolesKey = 'roles';
export const allowTemporaryPasswordKey = 'allowTemporaryPassword';

// Route without authentication. Only those listed in constitution §3 (login, refresh, etc.).
export const Public = () => SetMetadata(isPublicKey, true);

// Access level of an endpoint. `@Auth()` = any authenticated user;
// `@Auth(Role.ADMIN)` = only that role. An endpoint with neither `@Auth` nor `@Public`
// is rejected (default deny).
export const Auth = (...roles: Role[]) =>
  applyDecorators(
    SetMetadata(rolesKey, roles),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Sesión no válida o vencida' }),
    ApiForbiddenResponse({ description: 'No tiene permiso' }),
  );

// Route usable even with a pending temporary password (only POST /auth/change-password).
export const AllowTemporaryPassword = () => SetMetadata(allowTemporaryPasswordKey, true);

export const GetUser = createParamDecorator((field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
  if (!user) throw new UnauthorizedException('Sesión no válida o vencida');
  return field ? user[field] : user;
});
