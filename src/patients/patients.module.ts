import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth';
import { CatalogsModule } from '../catalogs/catalogs.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { CreatePatientUseCase } from './application/create-patient.use-case';
import { GetConsentUseCase } from './application/get-consent.use-case';
import { GetPatientAdministrativeRecordUseCase } from './application/get-patient-administrative-record.use-case';
import { GetPatientUseCase } from './application/get-patient.use-case';
import { ListPatientsUseCase } from './application/list-patients.use-case';
import { SetPatientStatusUseCase } from './application/set-patient-status.use-case';
import { UpdatePatientUseCase } from './application/update-patient.use-case';
import { ConsentVault, PatientsRepository } from './domain/ports/patients.repository';
import { PatientsController } from './infrastructure/http/patients.controller';
import { PatientsPrismaRepository } from './infrastructure/prisma/patients.prisma.repository';
import { EncryptedConsentVault } from './infrastructure/security/encrypted-consent.vault';

// CatalogsModule: validates avatar, diagnosis and conditions. ProfilesModule: creates the profile on registration and notifies the tablets.
@Module({
  imports: [AuthModule, CatalogsModule, ProfilesModule, AppointmentsModule],
  controllers: [PatientsController],
  providers: [
    { provide: PatientsRepository, useClass: PatientsPrismaRepository },
    { provide: ConsentVault, useClass: EncryptedConsentVault },
    CreatePatientUseCase,
    ListPatientsUseCase,
    GetPatientUseCase,
    GetPatientAdministrativeRecordUseCase,
    UpdatePatientUseCase,
    SetPatientStatusUseCase,
    GetConsentUseCase,
  ],
})
export class PatientsModule {}
