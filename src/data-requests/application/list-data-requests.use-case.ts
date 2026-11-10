import { Injectable } from '@nestjs/common';
import { Role } from '../../auth';
import { mapPage, PageRequest } from '../../common/pagination/page';
import { DataRequestStatus, DataRequestType } from '../domain/entities/data-request.entity';
import { DataRequestsRepository } from '../domain/ports/data-requests.repository';
import { toDataRequestView } from './data-request-view';

// Admin: all of them (only with the patient code). Therapist: those of their assigned patients.
@Injectable()
export class ListDataRequestsUseCase {
  constructor(private readonly requests: DataRequestsRepository) {}

  async execute(filter: { status?: DataRequestStatus; type?: DataRequestType }, page: PageRequest, viewer: { id: string; role: Role }) {
    const therapistId = viewer.role === Role.ADMIN ? undefined : viewer.id;
    return mapPage(await this.requests.list({ ...filter, therapistId }, page), toDataRequestView);
  }
}
