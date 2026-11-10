import { Injectable } from '@nestjs/common';
import { PageRequest } from '../../common/pagination/page';
import { CenterRepository } from '../domain/ports/center.repository';

@Injectable()
export class ListRoomsUseCase {
  constructor(private readonly repo: CenterRepository) {}

  execute(onlyActive: boolean, page: PageRequest) {
    return this.repo.listRooms(onlyActive, page);
  }
}
