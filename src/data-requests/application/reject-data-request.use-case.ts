import { Injectable } from '@nestjs/common';
import { Actor, DataRequestSupport } from './data-request-actor';
import { toDataRequestView } from './data-request-view';

// The administrator rejects an open request with a reason.
@Injectable()
export class RejectDataRequestUseCase {
  constructor(private readonly support: DataRequestSupport) {}

  async execute(id: string, notes: string, actor: Actor) {
    const request = await this.support.request(id);
    request.reject(actor.userId, notes);
    await this.support.requests.save(request);
    await this.support.recordRequest('DATA_REQUEST_REJECT', request, actor, { reason: notes });
    const patient = await this.support.patients.findByCode(request.patientCode);
    return toDataRequestView({ request, patientId: patient?.id ?? null, handledByName: actor.name ?? null });
  }
}
