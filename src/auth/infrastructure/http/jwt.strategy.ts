import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { GetAuthenticatedUserUseCase } from '../../application/get-authenticated-user.use-case';
import { SessionNotValid } from '../../domain/exceptions/auth.exceptions';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly getAuthenticatedUser: GetAuthenticatedUserUseCase,
    config: ConfigService,
  ) {
    super({
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload?.typ !== 'access' || !payload.sub) throw new SessionNotValid('token type');
    const user = await this.getAuthenticatedUser.execute(payload.sub);
    const { id, name, email, role, mustChangePassword, institutionId } = user;
    return { id, name, email, role, mustChangePassword, institutionId };
  }
}
