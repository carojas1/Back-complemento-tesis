import { Injectable } from '@nestjs/common';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned, ProfileNotFound } from '../domain/exceptions/profiles.exceptions';
import { PatientAccess, ProfilesRepository } from '../domain/ports/profiles.repository';
import { toProfileView } from './profile-view';

@Injectable()
export class GetProfileUseCase {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly access: PatientAccess,
    private readonly storage: FileStorage,
  ) {}

  async execute(input: { patientId: string; therapistId: string }) {
    if (!(await this.access.isAssigned(input.patientId, input.therapistId))) throw new PatientNotAssigned();
    // If the patient's profile was never created along with the patient, it is created now from the template.
    let board = await this.profiles.findBoard(input.patientId);
    if (!board) {
      await this.profiles.createFromTemplate(input.patientId);
      board = await this.profiles.findBoard(input.patientId);
    }
    if (!board) throw new ProfileNotFound();
    return toProfileView(board, this.storage);
  }
}
