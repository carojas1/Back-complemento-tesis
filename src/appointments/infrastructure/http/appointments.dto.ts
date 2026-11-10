import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { appointmentStatuses, closingStatuses } from '../../domain/entities/appointment.entity';
import type { AppointmentStatus, ClosingStatus } from '../../domain/entities/appointment.entity';

const optionalText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.normalize('NFC').trim() || undefined : value);
const plainMultiline = /^(?:[^<>\p{Cc}]|[\n\r\t])*$/u;
const plainMessage = 'No use < > ni caracteres de control';
// Present and null is a validation error, not a NOT NULL crash further down; only `undefined` means "leave as is".
const whenSent = ValidateIf((_, value) => value !== undefined);

export class ListAppointmentsQuery extends PaginationQuery {
  @ApiPropertyOptional({ example: '2026-10-29T00:00:00Z', description: 'Starts on this date or later' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'from debe ser una fecha' })
  from?: Date;

  @ApiPropertyOptional({ example: '2026-11-05T00:00:00Z', description: 'Starts before this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'to debe ser una fecha' })
  to?: Date;

  @ApiPropertyOptional({ format: 'uuid', description: 'Ignored for the specialist: they always see their own' })
  @IsOptional()
  @IsUUID('4', { message: 'therapistId debe ser un UUID' })
  therapistId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'patientId debe ser un UUID' })
  patientId?: string;

  @ApiPropertyOptional({ enum: appointmentStatuses })
  @IsOptional()
  @IsIn(appointmentStatuses, { message: 'status debe ser SCHEDULED, COMPLETED, CANCELED o NO_SHOW' })
  status?: AppointmentStatus;

  @ApiPropertyOptional({ example: 'Fonoaudiología' })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(80, { message: 'La especialidad puede tener hasta 80 caracteres' })
  specialty?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'roomId debe ser un UUID' })
  roomId?: string;
}

class AppointmentDetailsDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null leaves the appointment without a room' })
  @IsOptional()
  @IsUUID('4', { message: 'roomId debe ser un UUID' })
  roomId?: string | null;

  @ApiPropertyOptional({ maxLength: 500, description: 'Logistics only (clinical notes go in the observations)' })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(500, { message: 'Las notas pueden tener hasta 500 caracteres' })
  @Matches(plainMultiline, { message: plainMessage })
  notes?: string;
}

export class BookAppointmentDto extends AppointmentDetailsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'patientId debe ser un UUID' })
  patientId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for the admin; the specialist schedules for themselves' })
  @IsOptional()
  @IsUUID('4', { message: 'therapistId debe ser un UUID' })
  therapistId?: string;

  @ApiProperty({ example: '2026-10-30T14:00:00Z' })
  @Type(() => Date)
  @IsDate({ message: 'startsAt debe ser una fecha' })
  startsAt: Date;

  @ApiProperty({ example: '2026-10-30T14:45:00Z' })
  @Type(() => Date)
  @IsDate({ message: 'endsAt debe ser una fecha' })
  endsAt: Date;
}

export class RescheduleAppointmentDto extends AppointmentDetailsDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The specialist can only keep their own' })
  @whenSent
  @IsUUID('4', { message: 'therapistId debe ser un UUID' })
  therapistId?: string;

  @ApiPropertyOptional({ example: '2026-10-30T14:00:00Z' })
  @whenSent
  @Type(() => Date)
  @IsDate({ message: 'startsAt debe ser una fecha' })
  startsAt?: Date;

  @ApiPropertyOptional({ example: '2026-10-30T14:45:00Z' })
  @whenSent
  @Type(() => Date)
  @IsDate({ message: 'endsAt debe ser una fecha' })
  endsAt?: Date;
}

export class CloseAppointmentDto {
  @ApiProperty({ enum: closingStatuses })
  @IsIn(closingStatuses, { message: 'status debe ser COMPLETED, CANCELED o NO_SHOW' })
  status: ClosingStatus;
}
