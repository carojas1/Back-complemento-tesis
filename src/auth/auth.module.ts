import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ChangePasswordUseCase } from './application/change-password.use-case';
import { ForgotPasswordUseCase } from './application/forgot-password.use-case';
import { GetAuthenticatedUserUseCase } from './application/get-authenticated-user.use-case';
import { SetPinUseCase } from './application/set-pin.use-case';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { RefreshSessionUseCase } from './application/refresh-session.use-case';
import { ResetPasswordUseCase } from './application/reset-password.use-case';
import { SessionTokens } from './application/session-tokens.service';
import { AuthController } from './infrastructure/http/auth.controller';
import { AuthAuditLog, AuthMailer } from './domain/ports/auth-notifications.ports';
import { AuthRepository } from './domain/ports/auth.repository';
import { PasswordHasher, TokenService } from './domain/ports/security.ports';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password.hasher';
import { NodemailerAuthMailer } from './infrastructure/mail/auth.mailer';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';
import { AuthAuditPrisma } from './infrastructure/prisma/auth-audit.prisma';
import { AuthPrismaRepository } from './infrastructure/prisma/auth.prisma.repository';
import { JwtStrategy } from './infrastructure/http/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // Spec 101 FR-002: 15-minute access token.
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', '15m'), algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Ports → adapters
    { provide: AuthRepository, useClass: AuthPrismaRepository },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    { provide: AuthMailer, useClass: NodemailerAuthMailer },
    { provide: AuthAuditLog, useClass: AuthAuditPrisma },
    // Use cases
    SessionTokens,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    ChangePasswordUseCase,
    GetAuthenticatedUserUseCase,
    SetPinUseCase,
    JwtStrategy,
  ],
  // For users (102) and devices (103): users, sessions, argon2, opaque tokens and audit without duplicating them.
  exports: [AuthRepository, PasswordHasher, TokenService, AuthAuditLog, AuthMailer, GetAuthenticatedUserUseCase],
})
export class AuthModule {}
