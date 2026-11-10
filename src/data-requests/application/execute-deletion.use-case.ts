import { Injectable, Logger } from '@nestjs/common';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotFound } from '../../patients/domain/exceptions/patients.exceptions';
import { PatientEraser } from '../domain/ports/data-requests.repository';
import { ConfirmCodeMismatch } from '../domain/exceptions/data-requests.exceptions';
import { Actor, DataRequestSupport } from './data-request-actor';
import { toDataRequestView } from './data-request-view';

// Spec 110 T004: the administrator approves the deletion by typing the patient code (double confirmation).
// The record, consent, profile, voice, recordings, observations, goals and assignments are deleted; the sessions
// stay anonymous only with authorized statistical use. The code moves to RetiredPatientCode so the tablets
// delete the profile. The request and the audit log are kept (FR-001).
@Injectable()
export class ExecuteDeletionUseCase {
  private readonly logger = new Logger(ExecuteDeletionUseCase.name);

  constructor(
    private readonly support: DataRequestSupport,
    private readonly eraser: PatientEraser,
    private readonly storage: FileStorage,
  ) {}

  async execute(id: string, confirmCode: string, actor: Actor) {
    const request = await this.support.request(id);
    request.assertOpen('DELETION');
    if (confirmCode.trim().toUpperCase() !== request.patientCode.toUpperCase()) throw new ConfirmCodeMismatch();
    const patient = await this.support.patients.findByCode(request.patientCode);
    if (!patient) throw new PatientNotFound();

    const anonymize = request.statisticalUseAllowed === true;
    request.complete(actor.userId);
    const { files, sessions } = await this.eraser.erase({ patientId: patient.id, anonymize, adminId: actor.userId, request });

    // Outside the transaction: the bucket does not take part in it. A file that fails is left in the log to delete by hand.
    const failed: string[] = [];
    for (const path of files) await this.storage.remove(path).catch(() => failed.push(path));
    if (failed.length) this.logger.error(`Deletion ${request.patientCode}: not removed from the bucket ${failed.join(', ')}`);

    await this.support.record(
      {
        action: 'DATA_DELETION',
        entity: 'Patient',
        entityId: patient.id,
        patientCode: request.patientCode,
        summary: { requestId: request.id, anonymized: anonymize, sessions, files: files.length, filesNotRemoved: failed.length },
      },
      actor,
    );
    return toDataRequestView({ request, patientId: null, handledByName: actor.name ?? null });
  }
}
