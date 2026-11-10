import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxDate } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { trim } from '../../../common/validation/trim';

const nameMessage = 'Escriba entre 1 y 80 caracteres';
const phone = /^[0-9+\s-]{7,20}$/;
// In multipart, arrays arrive as text: "a,b" or a single value.
const toArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? (value as string[]) : typeof value === 'string' && value ? value.split(',') : [];

export class ListPatientsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Name, surname or code' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISCHARGED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISCHARGED'])
  status?: 'ACTIVE' | 'DISCHARGED';

  // Admin only (spec 102): a therapist's patients or those she does not have yet, to assign her more.
  @ApiPropertyOptional({ format: 'uuid', description: 'Admin only: patients assigned to this therapist' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Admin only: patients this therapist does not have yet' })
  @IsOptional()
  @IsUUID()
  notAssignedTo?: string;
}

// multipart/form-data: data + consentImage (validated by the use case from its bytes).
export class CreatePatientDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 80, { message: nameMessage }) firstNames: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 80, { message: nameMessage }) lastNames: string;
  @ApiProperty({ example: '2018-05-20' })
  @Type(() => Date)
  @IsDate({ message: 'Fecha de nacimiento no válida' })
  @MaxDate(() => new Date())
  birthDate: Date;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 80, { message: nameMessage }) guardianName: string;
  @ApiProperty({ example: '0991234567' }) @Matches(phone, { message: 'Teléfono no válido' }) guardianPhone: string;
  @ApiProperty({ example: '2026-10-23' })
  @Type(() => Date)
  @IsDate({ message: 'Fecha del consentimiento no válida' })
  @MaxDate(() => new Date())
  consentDate: Date;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4', { message: 'Elija un avatar' }) avatarId: string;
  @ApiProperty({ type: [String], format: 'uuid' })
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true, message: 'Terapeuta no válida' })
  therapistIds: string[];
}

export class UpdatePatientDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(1, 80, { message: nameMessage }) firstNames?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(1, 80, { message: nameMessage }) lastNames?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() @MaxDate(() => new Date()) birthDate?: Date;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(1, 80, { message: nameMessage }) guardianName?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(phone, { message: 'Teléfono no válido' }) guardianPhone?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') avatarId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') diagnosisId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) conditionIds?: string[];
}
