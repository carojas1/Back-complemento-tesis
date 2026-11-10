import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { BookAppointmentUseCase } from './application/book-appointment.use-case';
import { CloseAppointmentUseCase } from './application/close-appointment.use-case';
import { GetAppointmentUseCase } from './application/get-appointment.use-case';
import { ListAppointmentsUseCase } from './application/list-appointments.use-case';
import { RescheduleAppointmentUseCase } from './application/reschedule-appointment.use-case';
import { AppointmentsRepository, FutureAppointmentsCanceller } from './domain/ports/appointments.repository';
import { AppointmentsController } from './infrastructure/http/appointments.controller';
import { AppointmentsPrismaRepository, FutureAppointmentsPrismaCanceller } from './infrastructure/prisma/appointments.prisma.repository';

// Center agenda, shared by the admin and specialist panels. AuthModule provides AuthAuditLog.
@Module({
  imports: [AuthModule],
  controllers: [AppointmentsController],
  providers: [
    { provide: AppointmentsRepository, useClass: AppointmentsPrismaRepository },
    { provide: FutureAppointmentsCanceller, useClass: FutureAppointmentsPrismaCanceller },
    ListAppointmentsUseCase,
    GetAppointmentUseCase,
    BookAppointmentUseCase,
    RescheduleAppointmentUseCase,
    CloseAppointmentUseCase,
  ],
  exports: [FutureAppointmentsCanceller],
})
export class AppointmentsModule {}
