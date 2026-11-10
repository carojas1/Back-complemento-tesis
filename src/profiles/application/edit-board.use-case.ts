import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FileStorage } from '../../common/storage/file-storage';
import { AlreadyOnBoard, BoardItemNotFound, PatientNotAssigned, ProfileNotFound } from '../domain/exceptions/profiles.exceptions';
import { AddResult, PatientAccess, ProfilesRepository } from '../domain/ports/profiles.repository';
import { GetProfileUseCase } from './get-profile.use-case';

type Actor = { patientId: string; therapistId: string; ip?: string };
type Change =
  | { action: 'addCategory'; categoryId: string }
  | { action: 'removeCategory'; profileCategoryId: string }
  | { action: 'addPictogram'; profileCategoryId: string; pictogramId: string }
  | { action: 'removePictogram'; boardPictogramId: string }
  | { action: 'orderCategories'; profileCategoryIds: string[] }
  | { action: 'orderPictograms'; profileCategoryId: string; boardPictogramIds: string[] };

// Spec 105 FR-009 and 010: the assigned therapist builds her patient's board from the panel, copying from the Center catalog.
// Every change bumps the version (the tablet downloads it on the next sync) and is audited.
@Injectable()
export class EditBoardUseCase {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly access: PatientAccess,
    private readonly getProfile: GetProfileUseCase,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: Actor & Change) {
    if (!(await this.access.isAssigned(input.patientId, input.therapistId))) throw new PatientNotAssigned();
    const profile = await this.profiles.findByPatient(input.patientId);
    if (!profile) throw new ProfileNotFound();

    const added = (result: AddResult) => {
      if (result === 'missing') throw new BoardItemNotFound();
      if (result === 'duplicate') throw new AlreadyOnBoard();
    };
    if (input.action === 'addCategory') added(await this.profiles.addCategory(profile.id, input.categoryId));
    if (input.action === 'addPictogram') added(await this.profiles.addPictogram(profile.id, input.profileCategoryId, input.pictogramId));
    if (input.action === 'removeCategory' && !(await this.profiles.removeCategory(profile.id, input.profileCategoryId)))
      throw new BoardItemNotFound();
    if (input.action === 'orderCategories' && !(await this.profiles.orderCategories(profile.id, input.profileCategoryIds)))
      throw new BoardItemNotFound();
    if (
      input.action === 'orderPictograms' &&
      !(await this.profiles.orderPictograms(profile.id, input.profileCategoryId, input.boardPictogramIds))
    )
      throw new BoardItemNotFound();
    if (input.action === 'removePictogram') {
      const removed = await this.profiles.removePictogram(profile.id, input.boardPictogramId);
      if (!removed) throw new BoardItemNotFound();
      if (removed.recordingPath) await this.storage.remove(removed.recordingPath);
    }

    profile.markChanged();
    await this.profiles.saveSettings(profile);
    const { action, ...rest } = input;
    const target = Object.fromEntries(
      Object.entries(rest).filter(([key]) => /Ids?$/.test(key) && key !== 'patientId' && key !== 'therapistId'),
    );
    await this.audit.record({
      action: 'PROFILE_UPDATE',
      actorType: 'USER',
      actorId: input.therapistId,
      entity: 'Profile',
      entityId: profile.id,
      ip: input.ip,
      summary: { fields: [action], ...target, version: profile.version },
    });
    return this.getProfile.execute(input);
  }
}
