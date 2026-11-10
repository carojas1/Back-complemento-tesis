import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth';
import { DevicesModule } from '../devices/devices.module';
import { LimitsModule } from '../limits/limits.module';
import { AssignTemporaryPasswordUseCase } from './application/assign-temporary-password.use-case';
import { CheckTherapistPinUseCase } from './application/check-therapist-pin.use-case';
import { ClearPinUseCase } from './application/clear-pin.use-case';
import { CreateAccountUseCase } from './application/create-account.use-case';
import { GetAssignedPatientsUseCase } from './application/get-assigned-patients.use-case';
import { ListTabletTherapistsUseCase } from './application/list-tablet-therapists.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { ReplaceAssignedPatientsUseCase } from './application/replace-assigned-patients.use-case';
import { UpdateUserUseCase } from './application/update-user.use-case';
import { UsersRepository } from './domain/ports/users.repository';
import { TherapistsController } from './infrastructure/http/therapists.controller';
import { UsersController } from './infrastructure/http/users.controller';
import { UsersPrismaRepository } from './infrastructure/prisma/users.prisma.repository';

// AuthModule provides AuthRepository, PasswordHasher and AuthAuditLog. DevicesModule, the @DeviceAuth guards (spec 002).
// LimitsModule, the center's therapist limit.
@Module({
  imports: [AuthModule, DevicesModule, LimitsModule, AppointmentsModule],
  controllers: [UsersController, TherapistsController],
  providers: [
    { provide: UsersRepository, useClass: UsersPrismaRepository },
    ListUsersUseCase,
    CreateAccountUseCase,
    UpdateUserUseCase,
    AssignTemporaryPasswordUseCase,
    ClearPinUseCase,
    ListTabletTherapistsUseCase,
    CheckTherapistPinUseCase,
    GetAssignedPatientsUseCase,
    ReplaceAssignedPatientsUseCase,
  ],
})
export class UsersModule {}
