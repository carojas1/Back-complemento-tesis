import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { ProfileChanges } from '../domain/entities/profile.entity';
import { ClonedVoiceNotReady, PatientNotAssigned, ProfileNotFound } from '../domain/exceptions/profiles.exceptions';
import { PatientAccess, ProfilesRepository } from '../domain/ports/profiles.repository';
import { GetProfileUseCase } from './get-profile.use-case';

// Spec 105/010: grid, level, voice, phrase bar, activities and hidden pictograms. Every change bumps the version.
@Injectable()
export class UpdateProfileUseCase {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly access: PatientAccess,
    private readonly getProfile: GetProfileUseCase,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: ProfileChanges & { patientId: string; therapistId: string; hidden?: { id: string; hidden: boolean }; ip?: string }) {
    if (!(await this.access.isAssigned(input.patientId, input.therapistId))) throw new PatientNotAssigned();
    const profile = await this.profiles.findByPatient(input.patientId);
    if (!profile) throw new ProfileNotFound();
    if (input.voice === 'CLONED' && !(await this.profiles.voiceReady(input.patientId))) throw new ClonedVoiceNotReady();

    const changed: string[] = profile.edit(input);
    if (input.hidden && (await this.profiles.setPictogramHidden(profile, input.hidden.id, input.hidden.hidden))) {
      if (changed.length === 0) profile.markChanged();
      changed.push('hidden');
    }
    if (changed.length > 0) {
      await this.profiles.saveSettings(profile);
      await this.audit.record({
        action: 'PROFILE_UPDATE',
        actorType: 'USER',
        actorId: input.therapistId,
        entity: 'Profile',
        entityId: profile.id,
        ip: input.ip,
        summary: { fields: changed, version: profile.version },
      });
    }
    return this.getProfile.execute(input);
  }
}
