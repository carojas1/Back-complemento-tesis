import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataRequest, DataRequestType } from '../domain/entities/data-request.entity';
import { Actor, DataRequestSupport } from './data-request-actor';
import { toDataRequestView } from './data-request-view';

// Spec 110: the assigned therapist registers the guardian's request; it stays open with a 15-day deadline.
@Injectable()
export class CreateDataRequestUseCase {
  constructor(private readonly support: DataRequestSupport) {}

  async execute(patientId: string, input: { type: DataRequestType; notes?: string; statisticalUseAllowed?: boolean }, actor: Actor) {
    const patient = await this.support.assignedPatient({ id: patientId }, actor);
    const request = DataRequest.create({ id: randomUUID(), patientCode: patient.code, ...input });
    await this.support.requests.save(request);
    await this.support.recordRequest('DATA_REQUEST_CREATE', request, actor, { statisticalUseAllowed: request.statisticalUseAllowed });
    return toDataRequestView({ request, patientId: patient.id, handledByName: null });
  }
}
