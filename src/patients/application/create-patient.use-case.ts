import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { CatalogsRepository } from '../../catalogs/domain/ports/catalogs.repository';
import { FileStorage } from '../../common/storage/file-storage';
import { detectImageType } from '../../pictograms/domain/entities/pictogram.entity';
import { CreateProfileFromTemplateUseCase } from '../../profiles/application/create-profile-from-template.use-case';
import { Patient } from '../domain/entities/patient.entity';
import { ConsentRequired, UnknownCatalogValue, UnknownTherapists } from '../domain/exceptions/patients.exceptions';
import { ConsentVault, PatientsRepository } from '../domain/ports/patients.repository';
import { toPatientSummaryView } from './patient-view';

type NewPatient = Pick<Patient, 'firstNames' | 'lastNames' | 'birthDate' | 'guardianName' | 'guardianPhone' | 'consentDate' | 'avatarId'>;

// Spec 104 (agreed 2026-10-23): the admin creates the basic record with the consent photo and the assigned therapists.
// Without consent it is not created. It gets a sequential code and its profile with the basic vocabulary.
@Injectable()
export class CreatePatientUseCase {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly catalogs: CatalogsRepository,
    private readonly vault: ConsentVault,
    private readonly createProfile: CreateProfileFromTemplateUseCase,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: NewPatient & { therapistIds: string[]; consentImage?: Buffer; actorId: string; ip?: string }) {
    const type = input.consentImage && input.consentImage.length <= 1_000_000 ? detectImageType(input.consentImage) : null;
    if (!input.consentImage || !type) throw new ConsentRequired();
    const avatar = await this.catalogs.find('avatars', input.avatarId);
    if (!avatar?.active) throw new UnknownCatalogValue('El avatar');
    const therapistIds = await this.patients.activeTherapistIds([...new Set(input.therapistIds)]);
    if (therapistIds.length === 0 || therapistIds.length !== new Set(input.therapistIds).size) throw new UnknownTherapists();

    const consentFilePath = await this.vault.store(input.consentImage, type === 'png' ? 'image/png' : 'image/jpeg');
    const patient = Patient.create({ ...input, code: await this.patients.nextCode(), consentFilePath, createdBy: input.actorId });
    await this.patients.save(patient, therapistIds);
    // ponytail: patient and profile are not in a single transaction (they are different modules); if the profile failed, it is created when opened.
    await this.createProfile.execute(patient.id);

    await this.audit.record({
      action: 'PATIENT_CREATE',
      actorType: 'USER',
      actorId: input.actorId,
      entity: 'Patient',
      entityId: patient.id,
      patientCode: patient.code,
      ip: input.ip,
      summary: { therapists: therapistIds.length },
    });
    const summary = await this.patients.find(patient.id);
    return toPatientSummaryView(summary!, this.storage);
  }
}
