import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
// prettier-ignore
import { Equals, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { privacyNoticeVersion, requestStatuses } from '../../domain/entities/institution-request.entity';
import type { RequestStatus } from '../../domain/entities/institution-request.entity';

// Public form sanitization (spec 113 FR-005): spaces trimmed and collapsed, no control characters or
// HTML tags. The API does not build HTML with these texts, but the e-mail and the panel display them.
const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const optionalText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.normalize('NFC').trim() || undefined : value);
const plainText = /^[^<>\p{Cc}]*$/u;
const plainMultiline = /^(?:[^<>\p{Cc}]|[\n\r\t])*$/u; // allows line breaks
const plainMessage = 'No use < > ni caracteres de control';
const personName = /^[\p{L}\p{M}' .-]+$/u;
// An empty text clears the value (null).
const emptyToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class CreateInstitutionRequestDto {
  @ApiProperty({ example: 'Fundación Sonrisas' })
  @Transform(clean)
  @IsString()
  @Length(3, 120, { message: 'El nombre de la institución debe tener entre 3 y 120 caracteres' })
  @Matches(plainText, { message: plainMessage })
  institutionName: string;

  // 13 digits: province (01–24 or 30), type (0–6 or 9), seven digits and 001 (main establishment).
  @ApiProperty({ example: '0190012345001' })
  @Transform(clean)
  @Matches(/^(0[1-9]|1\d|2[0-4]|30)[0-69]\d{7}001$/, { message: 'El RUC debe tener 13 dígitos y terminar en 001' })
  ruc: string;

  @ApiProperty({ example: 'Cuenca' })
  @Transform(clean)
  @IsString()
  @Length(2, 60, { message: 'La ciudad debe tener entre 2 y 60 caracteres' })
  @Matches(plainText, { message: plainMessage })
  city: string;

  @ApiProperty({ example: 'Centro de terapia' })
  @Transform(clean)
  @IsString()
  @Length(2, 80, { message: 'El tipo de institución debe tener entre 2 y 80 caracteres' })
  @Matches(plainText, { message: plainMessage })
  kind: string;

  @ApiProperty({ example: 'María Pérez' })
  @Transform(clean)
  @IsString()
  @Length(3, 120, { message: 'El nombre del contacto debe tener entre 3 y 120 caracteres' })
  @Matches(personName, { message: 'El nombre del contacto solo lleva letras, espacios, puntos y guiones' })
  contactName: string;

  @ApiProperty({ example: 'direccion@fundacion.org' })
  @Transform(lower)
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  contactEmail: string;

  @ApiProperty({ example: '0991234567' })
  @Transform(clean)
  @Matches(/^\+?[\d -]{7,20}$/, { message: 'Ingrese un teléfono válido' })
  contactPhone: string;

  @ApiProperty({ example: 40 })
  @Type(() => Number)
  @IsInt({ message: 'El número de pacientes debe ser un entero' })
  @Min(1, { message: 'El número de pacientes debe ser al menos 1' })
  @Max(100_000, { message: 'El número de pacientes es demasiado alto' })
  approxPatients: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(1000, { message: 'El mensaje puede tener hasta 1000 caracteres' })
  @Matches(plainMultiline, { message: plainMessage })
  message?: string;

  // The version of the privacy notice the app showed: if it differs, the text changed and must be read again.
  @ApiProperty({ example: privacyNoticeVersion })
  @Equals(privacyNoticeVersion, { message: 'Acepte el aviso de privacidad vigente' })
  privacyVersion: string;
}

export class ListRequestsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: requestStatuses })
  @IsOptional()
  @IsIn(requestStatuses, { message: 'status debe ser PENDING, IN_REVIEW, APPROVED o REJECTED' })
  status?: RequestStatus;
}

export class RejectRequestDto {
  @ApiProperty({ example: 'No es una institución de salud o educación' })
  @Transform(clean)
  @IsString()
  @Length(3, 1000, { message: 'El motivo debe tener entre 3 y 1000 caracteres' })
  @Matches(plainText, { message: plainMessage })
  reason: string;
}

// Notes from the call with the center (request review).
export class ReviewNotesDto {
  @ApiProperty({ example: 'Hablé con la directora. Envía el certificado del RUC mañana.' })
  @Transform(optionalText)
  @IsString({ message: 'Escriba las notas de la llamada' })
  @Length(3, 2000, { message: 'Las notas deben tener entre 3 y 2000 caracteres' })
  @Matches(plainMultiline, { message: plainMessage })
  notes: string;
}

export class ListInstitutionsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Name, RUC or city' })
  @IsOptional()
  @Transform(clean)
  @IsString()
  @MaxLength(120, { message: 'La búsqueda puede tener hasta 120 caracteres' })
  @Matches(plainText, { message: plainMessage })
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  // Everything in a query arrives as text.
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'active debe ser true o false' })
  active?: boolean;
}

// Profile and limits of a center (super admin only). null in the limits = no limit.
export class UpdateInstitutionDto {
  @ApiPropertyOptional({ example: 'Fundación Sonrisas' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(clean)
  @IsString()
  @Length(3, 120, { message: 'El nombre de la institución debe tener entre 3 y 120 caracteres' })
  @Matches(plainText, { message: plainMessage })
  name?: string;

  @ApiPropertyOptional({ example: 'Cuenca' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(clean)
  @IsString()
  @Length(2, 60, { message: 'La ciudad debe tener entre 2 y 60 caracteres' })
  @Matches(plainText, { message: plainMessage })
  city?: string;

  @ApiPropertyOptional({ example: 'Centro de terapia' })
  @IsOptional()
  @Transform(clean)
  @IsString()
  @Length(2, 80, { message: 'El tipo de institución debe tener entre 2 y 80 caracteres' })
  @Matches(plainText, { message: plainMessage })
  kind?: string;

  @ApiPropertyOptional({ example: 'info@sonrisas.org', nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value))
  @ValidateIf((_, value) => value !== null)
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  email?: string | null;

  @ApiPropertyOptional({ example: '072345678', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\+?[\d -]{7,20}$/, { message: 'Ingrese un teléfono válido' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Av. Solano 1-23', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200, { message: 'La dirección puede tener hasta 200 caracteres' })
  @Matches(plainText, { message: plainMessage })
  address?: string | null;

  @ApiPropertyOptional({ example: 10, nullable: true, description: 'null = no limit' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt({ message: 'El límite de terapeutas debe ser un entero' })
  @Min(1, { message: 'El límite de terapeutas debe ser al menos 1' })
  @Max(10_000, { message: 'El límite de terapeutas es demasiado alto' })
  maxTherapists?: number | null;

  @ApiPropertyOptional({ example: 5, nullable: true, description: 'null = no limit' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt({ message: 'El límite de tabletas debe ser un entero' })
  @Min(1, { message: 'El límite de tabletas debe ser al menos 1' })
  @Max(10_000, { message: 'El límite de tabletas es demasiado alto' })
  maxDevices?: number | null;
}

export class SetInstitutionStatusDto {
  @ApiProperty({ description: 'false = suspend (nothing is deleted)' })
  @IsBoolean({ message: 'active debe ser true o false' })
  active: boolean;

  @ApiPropertyOptional({ example: 'Centro cerrado por remodelación', description: 'Required when suspending' })
  @ValidateIf((dto: SetInstitutionStatusDto) => dto.active === false)
  @Transform(clean)
  @IsString({ message: 'Indique el motivo de la suspensión' })
  @Length(3, 500, { message: 'El motivo debe tener entre 3 y 500 caracteres' })
  @Matches(plainText, { message: plainMessage })
  reason?: string;
}

export class CreateInstitutionAdminDto {
  @ApiProperty({ example: 'Ana Torres' })
  @Transform(clean)
  @IsString()
  @Length(3, 120, { message: 'El nombre debe tener entre 3 y 120 caracteres' })
  @Matches(personName, { message: 'El nombre solo lleva letras, espacios, puntos y guiones' })
  name: string;

  @ApiProperty({ example: 'ana@sonrisas.org' })
  @Transform(lower)
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  email: string;
}
