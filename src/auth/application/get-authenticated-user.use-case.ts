import { Injectable } from '@nestjs/common';
import { User } from '../domain/entities/user.entity';
import { SessionNotValid } from '../domain/exceptions/auth.exceptions';
import { AuthRepository } from '../domain/ports/auth.repository';

// Rule for accepting an access token: the user exists and is still active (and so is their institution, spec 113).
// Searches all institutions: the request's institution comes from here.
// The role is read from the database, so a role change or a deactivation applies
// on the next request and not when the token expires.
@Injectable()
export class GetAuthenticatedUserUseCase {
  constructor(private readonly repo: AuthRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.repo.findAccount(userId);
    if (!user?.canLogIn()) throw new SessionNotValid('nonexistent or inactive user');
    return user;
  }
}
