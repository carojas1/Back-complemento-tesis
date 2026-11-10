import { Role } from '../../domain/entities/user.entity';

export interface JwtPayload {
  sub: string;
  role: Role;
  typ: 'access';
  // Set by the signer; seconds since the epoch.
  exp?: number;
}

// What ends up in `req.user`: a plain object, never the Prisma row.
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  institutionId: string | null; // spec 113: the request's; null for the super admin
  // With a temporary password it can only call routes with @AllowTemporaryPassword.
  mustChangePassword: boolean;
}
