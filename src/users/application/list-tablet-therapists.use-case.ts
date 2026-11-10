import { Injectable } from '@nestjs/common';
import { Role } from '../../auth/domain/entities/user.entity';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { UsersRepository } from '../domain/ports/users.repository';

// Spec 002 FR-003: the tablet shows "who are you?" with the active therapists. Only id, name and whether they have a PIN.
@Injectable()
export class ListTabletTherapistsUseCase {
  constructor(private readonly users: UsersRepository) {}

  async execute(page: PageRequest) {
    const therapists = await this.users.list({ role: Role.THERAPIST, active: true }, page);
    return mapPage(therapists, (user) => ({ id: user.id, name: user.name, hasPin: user.hasPin() }));
  }
}
