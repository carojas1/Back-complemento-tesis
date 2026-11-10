import { Injectable } from '@nestjs/common';
import { Actor, DataRequestSupport } from './data-request-actor';
import { toDataRequestView } from './data-request-view';

// Rectification (spec 110): the therapist corrects the record (PATCH /patients/:id, audited PATIENT_UPDATE) and closes
// the request with the reason and what was corrected; it ends up as DONE with date and responsible person.
@Injectable()
export class CompleteRectificationUseCase {
  constructor(private readonly support: DataRequestSupport) {}

  async execute(id: string, notes: string, actor: Actor) {
    const request = await this.support.request(id);
    request.assertOpen('RECTIFICATION');
    const patient = await this.support.assignedPatient({ code: request.patientCode }, actor);
    request.complete(actor.userId, notes);
    await this.support.requests.save(request);
    await this.support.recordRequest('DATA_REQUEST_RECTIFY', request, actor, { reason: notes });
    return toDataRequestView({ request, patientId: patient.id, handledByName: actor.name ?? null });
  }
}
