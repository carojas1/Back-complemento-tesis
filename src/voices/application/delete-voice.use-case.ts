import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { PatientAccess } from '../../profiles/domain/ports/profiles.repository';
import { VoiceNotFound } from '../domain/exceptions/voices.exceptions';
import { VoicesRepository } from '../domain/ports/voices.repository';

// Deletes the cloned voice (e.g. if the person withdraws consent): the sample and all its audios leave the bucket
// and the board goes back to the system voice.
@Injectable()
export class DeleteVoiceUseCase {
  constructor(
    private readonly voices: VoicesRepository,
    private readonly access: PatientAccess,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: { patientId: string; therapistId: string; ip?: string }) {
    if (!(await this.access.isAssigned(input.patientId, input.therapistId))) throw new PatientNotAssigned();
    const voice = await this.voices.findByPatient(input.patientId);
    if (!voice) throw new VoiceNotFound();
    for (const path of await this.voices.delete(voice)) await this.storage.remove(path);
    await this.audit.record({
      action: 'VOICE_DELETE',
      actorType: 'USER',
      actorId: input.therapistId,
      entity: 'Voice',
      entityId: voice.id,
      ip: input.ip,
      summary: { patientId: input.patientId },
    });
  }
}
