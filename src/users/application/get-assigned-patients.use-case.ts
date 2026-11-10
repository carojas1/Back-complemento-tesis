import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../../auth/domain/ports/auth.repository';
import { PageRequest } from '../../common/pagination/page';
import { UserNotFound } from '../domain/exceptions/users.exceptions';
import { UsersRepository } from '../domain/ports/users.repository';

@Injectable()
export class GetAssignedPatientsUseCase {
  constructor(
    private readonly auth: AuthRepository,
    private readonly users: UsersRepository,
  ) {}

  async execute(userId: string, page: PageRequest) {
    const user = await this.auth.findUserById(userId);
    if (!user) throw new UserNotFound();
    return this.users.listAssignedPatients(user, page);
  }
}
