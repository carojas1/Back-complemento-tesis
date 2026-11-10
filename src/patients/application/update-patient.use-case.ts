import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { CatalogsRepository } from '../../catalogs/domain/ports/catalogs.repository';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { ProfilesRepository } from '../../profiles/domain/ports/profiles.repository';
import { Patient, PatientChanges } from '../domain/entities/patient.entity';
import { PatientNotFound, UnknownCatalogValue } from '../domain/exceptions/patients.exceptions';
import { PatientsRepository } from '../domain/ports/patients.repository';
import { toPatientView } from './patient-view';

// The assigned therapist completes and corrects the record (spec 104). Avatar, diagnosis and conditions come from the catalogs.
@Injectable()
export class UpdatePatientUseCase {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly catalogs: CatalogsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
  ) {}

  async execute(input: PatientChanges & { id: string; therapistId: string; ip?: string }) {
    const summary = await this.patients.find(input.id);
    if (!summary) throw new PatientNotFound();
    if (!(await this.patients.isAssigned(input.id, input.therapistId))) throw new PatientNotAssigned();
    const { patient } = summary;
    await this.checkCatalogs(input, patient);

    const { id: _id, therapistId: _therapistId, ip: _ip, ...changes } = input;
    const changed = patient.edit(changes);
    if (changed.length > 0) {
      await this.patients.save(patient);
      // The avatar travels to the tablet: if it changes, the profile is delivered again.
      if (changed.includes('avatarId')) await this.profiles.touch(patient.id);
      await this.audit.record({
        action: 'PATIENT_UPDATE',
        actorType: 'USER',
        actorId: input.therapistId,
        entity: 'Patient',
        entityId: patient.id,
        patientCode: patient.code,
        ip: input.ip,
        summary: { fields: changed },
      });
    }
    return toPatientView((await this.patients.find(input.id))!, this.storage);
  }

  // Anything newly chosen must exist and be active; what it already had is kept even if it was later deactivated.
  private async checkCatalogs({ avatarId, diagnosisId, conditionIds }: PatientChanges, current: Patient) {
    if (avatarId && avatarId !== current.avatarId && !(await this.catalogs.find('avatars', avatarId))?.active)
      throw new UnknownCatalogValue('El avatar');
    if (diagnosisId && diagnosisId !== current.diagnosisId && !(await this.catalogs.find('diagnoses', diagnosisId))?.active)
      throw new UnknownCatalogValue('El diagnóstico');
    const added = [...new Set(conditionIds ?? [])].filter((id) => !current.conditionIds.includes(id));
    if (added.length > 0) {
      const found = await this.catalogs.findMany('conditions', added);
      if (found.length !== added.length || found.some((c) => !c.active)) throw new UnknownCatalogValue('Alguna condición');
    }
  }
}
