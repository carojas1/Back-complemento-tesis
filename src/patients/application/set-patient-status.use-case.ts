import { Injectable } from '@nestjs/common';
import { AuthAuditLog } from '../../auth/domain/ports/auth-notifications.ports';
import { FutureAppointmentsCanceller } from '../../appointments/domain/ports/appointments.repository';
import { FileStorage } from '../../common/storage/file-storage';
import { PatientNotAssigned } from '../../profiles/domain/exceptions/profiles.exceptions';
import { ProfilesRepository } from '../../profiles/domain/ports/profiles.repository';
import { PatientNotFound } from '../domain/exceptions/patients.exceptions';
import { PatientsRepository } from '../domain/ports/patients.repository';
import { toPatientView } from './patient-view';

// Therapeutic discharge and reactivation (agreed: discharge is reversible). Tablets find out on the next sync.
@Injectable()
export class SetPatientStatusUseCase {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuthAuditLog,
    private readonly appointments: FutureAppointmentsCanceller,
  ) {}

  async execute(input: { id: string; discharge: boolean; therapistId: string; ip?: string }) {
    const summary = await this.patients.find(input.id);
    if (!summary) throw new PatientNotFound();
    if (!(await this.patients.isAssigned(input.id, input.therapistId))) throw new PatientNotAssigned();

    const { patient } = summary;
    const before = patient.status;
    if (input.discharge) patient.discharge(new Date());
    else patient.reactivate();
    if (patient.status !== before) {
      await this.patients.save(patient);
      await this.profiles.touch(patient.id);
      if (input.discharge) await this.appointments.cancelForPatient(patient.id, new Date());
      await this.audit.record({
        action: input.discharge ? 'PATIENT_DISCHARGE' : 'PATIENT_REACTIVATE',
        actorType: 'USER',
        actorId: input.therapistId,
        entity: 'Patient',
        entityId: patient.id,
        patientCode: patient.code,
        ip: input.ip,
      });
    }
    return toPatientView((await this.patients.find(input.id))!, this.storage);
  }
}
