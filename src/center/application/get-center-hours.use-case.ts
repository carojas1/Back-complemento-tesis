import { Injectable } from '@nestjs/common';
import { CenterRepository } from '../domain/ports/center.repository';

@Injectable()
export class GetCenterHoursUseCase {
  constructor(private readonly repo: CenterRepository) {}

  execute() {
    return this.repo.getHours();
  }
}
