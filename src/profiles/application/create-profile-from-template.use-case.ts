import { Injectable } from '@nestjs/common';
import { ProfilesRepository } from '../domain/ports/profiles.repository';

// Spec 104/105: every new patient starts with the Center's basic vocabulary, which is adapted afterwards.
@Injectable()
export class CreateProfileFromTemplateUseCase {
  constructor(private readonly profiles: ProfilesRepository) {}

  execute(patientId: string) {
    return this.profiles.createFromTemplate(patientId);
  }
}
