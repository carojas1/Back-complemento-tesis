// Public API of the auth module for the rest of the app.
export { AuthModule } from './auth.module';
export { Role } from './domain/entities/user.entity';
export { AllowTemporaryPassword, Auth, GetUser, Public } from './infrastructure/http/auth.decorators';
export type { AuthenticatedUser } from './infrastructure/http/jwt-payload.interface';
