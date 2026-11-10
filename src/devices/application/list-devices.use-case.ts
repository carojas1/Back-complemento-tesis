import { Injectable } from '@nestjs/common';
import { PageRequest } from '../../common/pagination/page';
import { DevicesRepository } from '../domain/ports/devices.repository';

@Injectable()
export class ListDevicesUseCase {
  constructor(private readonly devices: DevicesRepository) {}

  execute(page: PageRequest) {
    return this.devices.list(page);
  }
}
