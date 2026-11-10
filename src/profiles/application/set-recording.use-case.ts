import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { WordAudio } from '../../common/audio/word-audio';
import { FileStorage } from '../../common/storage/file-storage';
import {
  BoardItemNotFound,
  InvalidRecording,
  PatientNotAssigned,
  ProfileNotFound,
  RecordingTooLong,
} from '../domain/exceptions/profiles.exceptions';
import { AudioConverter, PatientAccess, ProfilesRepository } from '../domain/ports/profiles.repository';
import { GetProfileUseCase } from './get-profile.use-case';

// Spec 105 FR-004: up to 3 s and 200 KB in m4a. 0.5 s margin: the app cuts off past 3 s, with some delay.
export const recordingRules = { maxSeconds: 3, toleranceSeconds: 0.5, maxBytes: 200_000 };

// Spec 010 and 105 FR-004: the therapist records her voice for a pictogram from the app panel (m4a) or the web (webm or
// ogg, converted to m4a); removing it goes back to the cloned voice or the system one. The audio goes to the bucket
// (`recordings/…`), without silence at the edges and at the volume of the other words so the phrase sounds continuous, and
// the database stores only the path.
@Injectable()
export class SetRecordingUseCase {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly access: PatientAccess,
    private readonly getProfile: GetProfileUseCase,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
    private readonly converter: AudioConverter,
    private readonly words: WordAudio,
  ) {}

  async execute(input: { patientId: string; therapistId: string; boardPictogramId: string; audio: Buffer | null; ip?: string }) {
    if (!(await this.access.isAssigned(input.patientId, input.therapistId))) throw new PatientNotAssigned();
    const profile = await this.profiles.findByPatient(input.patientId);
    if (!profile) throw new ProfileNotFound();
    const audio = input.audio ? await this.convert(input.audio) : null;

    const path = audio ? `recordings/${input.boardPictogramId}-${randomUUID()}.m4a` : null;
    if (path) await this.storage.put(path, audio!, 'audio/mp4');
    const result = await this.profiles.setRecording(profile.id, input.boardPictogramId, path);
    if (!result) {
      if (path) await this.storage.remove(path);
      throw new BoardItemNotFound();
    }
    if (result.previous) await this.storage.remove(result.previous);

    profile.markChanged();
    await this.profiles.saveSettings(profile);
    await this.audit.record({
      action: 'PROFILE_UPDATE',
      actorType: 'USER',
      actorId: input.therapistId,
      entity: 'Profile',
      entityId: profile.id,
      ip: input.ip,
      summary: { fields: [path ? 'recording' : 'recordingRemoved'], boardPictogramId: input.boardPictogramId, version: profile.version },
    });
    return this.getProfile.execute(input);
  }

  private async convert(audio: Buffer) {
    const m4a = audio.length > 12 ? await this.converter.toM4a(audio) : null;
    if (!m4a || m4a.audio.length > recordingRules.maxBytes) throw new InvalidRecording();
    if (m4a.seconds > recordingRules.maxSeconds + recordingRules.toleranceSeconds) throw new RecordingTooLong();
    return (await this.words.prepare(m4a.audio, 'm4a'))?.audio ?? m4a.audio;
  }
}
