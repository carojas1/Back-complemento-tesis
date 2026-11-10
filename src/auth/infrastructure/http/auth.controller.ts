import { RefreshRaceLost } from '../../domain/exceptions/auth.exceptions';
import { Body, Controller, HttpCode, HttpStatus, Post, Put, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { ChangePasswordUseCase } from '../../application/change-password.use-case';
import { ForgotPasswordUseCase } from '../../application/forgot-password.use-case';
import { LoginUseCase } from '../../application/login.use-case';
import { LogoutUseCase } from '../../application/logout.use-case';
import { RefreshSessionUseCase } from '../../application/refresh-session.use-case';
import { ResetPasswordUseCase } from '../../application/reset-password.use-case';
import { SetPinUseCase } from '../../application/set-pin.use-case';
import { Role } from '../../domain/entities/user.entity';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, ResetPasswordDto, SetPinDto } from './auth.dto';
import { IssuedSession } from '../../application/session-tokens.service';
import { AllowTemporaryPassword, Auth, GetUser, Public } from './auth.decorators';

export const refreshCookieName = 'refresh';

// Spec 101 FR-003: httpOnly, Secure, SameSite=Strict; only travels to /auth.
const refreshCookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auth',
  expires,
});

// Response mapper (domain → spec 101 contract JSON).
const toSessionResponse = (session: IssuedSession) => ({
  accessToken: session.accessToken,
  user: {
    id: session.user.id,
    name: session.user.name,
    role: session.user.role,
    institutionId: session.user.institutionId,
    mustChangePassword: session.user.mustChangePassword,
    hasPin: session.user.hasPin(),
  },
});

const readRefreshCookie = (req: Request): string | undefined => (req.cookies as Record<string, string> | undefined)?.[refreshCookieName];

// Spec 101 FR-003 (agreed 2026-10-23): the mobile app (recognized by X-App-Key) does not keep the `Secure` cookie; it receives the
// refresh token in the body, keeps it in memory only and sends it back to /auth/refresh and /auth/logout.

// The auth routes are public (constitution §3) and protected with rate limiting;
// only change-password requires a session.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly appKey: Buffer;

  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly setPinUseCase: SetPinUseCase,
    config: ConfigService,
  ) {
    this.appKey = Buffer.from(config.getOrThrow<string>('APP_KEY'));
  }

  private fromApp(req: Request) {
    const sent = Buffer.from(req.header('x-app-key') ?? '');
    return sent.length === this.appKey.length && timingSafeEqual(sent, this.appKey);
  }

  // Session response: the web receives the refresh only in the cookie; the app, also in the body.
  private respond(req: Request, res: Response, session: IssuedSession) {
    res.cookie(refreshCookieName, session.refreshToken, refreshCookieOptions(session.refreshExpiresAt));
    return this.fromApp(req) ? { ...toSessionResponse(session), refreshToken: session.refreshToken } : toSessionResponse(session);
  }

  private refreshTokenOf(req: Request, body?: RefreshDto) {
    return readRefreshCookie(req) ?? (this.fromApp(req) ? body?.refreshToken : undefined);
  }

  @Public()
  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in. Returns the access token and leaves the refresh in an httpOnly cookie' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.loginUseCase.execute({ ...dto, ip: req.ip }));
  }

  @Public()
  // Per IP, and a center's staff share one: every page load refreshes, so this is a brake on abuse rather than on people.
  @Throttle({ medium: { limit: 120, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(refreshCookieName)
  @ApiOperation({ summary: 'Renews the access token and rotates the refresh cookie' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(req, res, await this.refreshSessionUseCase.execute(this.refreshTokenOf(req, dto)));
    } catch (error) {
      // The request that won the race already set the new cookie: clearing it here would sign the browser out.
      if (!(error instanceof RefreshRaceLost)) res.clearCookie(refreshCookieName, refreshCookieOptions());
      throw error;
    }
  }

  @Public()
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(refreshCookieName)
  @ApiOperation({ summary: 'Revokes the refresh token and clears the cookie' })
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.logoutUseCase.execute(this.refreshTokenOf(req, dto), req.ip);
    res.clearCookie(refreshCookieName, refreshCookieOptions());
  }

  @Public()
  @Throttle({ medium: { limit: 3, ttl: 60_000 }, long: { limit: 10, ttl: 15 * 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sends the recovery link (30 min). Responds 204 whether or not the e-mail exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.forgotPasswordUseCase.execute({ email: dto.email, ip: req.ip });
  }

  @Public()
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Changes the password with the token from the e-mail and closes all sessions' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.resetPasswordUseCase.execute({ ...dto, ip: req.ip });
  }

  @Auth()
  @AllowTemporaryPassword()
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changes the password (mandatory with a temporary password). Closes the other sessions and rotates the cookie' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @GetUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(req, res, await this.changePasswordUseCase.execute({ ...dto, userId, ip: req.ip }));
  }

  @Auth(Role.THERAPIST)
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  @Put('pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Creates or changes the therapist's tablet PIN (spec 002), confirming her password" })
  async setPin(@Body() dto: SetPinDto, @GetUser('id') userId: string, @Req() req: Request) {
    await this.setPinUseCase.execute({ ...dto, userId, ip: req.ip });
  }
}
