import { Injectable } from '@nestjs/common';
import { PageRequest } from '../../common/pagination/page';
import { UserFilter, UsersRepository } from '../domain/ports/users.repository';

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly users: UsersRepository) {}

  execute(filter: UserFilter, page: PageRequest) {
    return this.users.list(filter, page);
  }
}
