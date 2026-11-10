import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
// prettier-ignore
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { passwordPattern, pinPattern, Role } from '../../../auth/domain/entities/user.entity';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { trim } from '../../../common/validation/trim';

const passwordMessage = 'La clave temporal debe tener al menos 10 caracteres, con letras y números';

export class ListUsersQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role, { message: 'Rol no válido' })
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  // In the query everything arrives as text.
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'active debe ser true o false' })
  active?: boolean;
}

export class CreateAccountDto {
  @ApiProperty({ example: 'Ana Pérez' })
  @Transform(trim)
  @IsString({ message: 'Ingrese el nombre' })
  @Length(1, 120, { message: 'El nombre debe tener entre 1 y 120 caracteres' })
  name: string;

  @ApiProperty({ example: 'ana@centro.org' })
  @Transform(trim)
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  email: string;

  @ApiProperty({ example: 'Temporal2026', minLength: 10 })
  @IsString({ message: 'Ingrese la clave temporal' })
  @MaxLength(128, { message: 'La clave es demasiado larga' })
  @Matches(passwordPattern, { message: passwordMessage })
  temporaryPassword: string;

  @ApiPropertyOptional({ enum: [Role.THERAPIST, Role.PARENT], default: Role.THERAPIST, description: 'PARENT: guardian (spec 112)' })
  @IsOptional()
  @IsIn([Role.THERAPIST, Role.PARENT], { message: 'Rol no válido: terapeuta o representante' })
  role?: Role.THERAPIST | Role.PARENT;

  @ApiPropertyOptional({ example: 'Fonoaudiología', maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Ingrese la especialidad' })
  @Length(2, 80, { message: 'La especialidad debe tener entre 2 y 80 caracteres' })
  specialty?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ana Pérez' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Ingrese el nombre' })
  @Length(1, 120, { message: 'El nombre debe tener entre 1 y 120 caracteres' })
  name?: string;

  @ApiPropertyOptional({ example: 'ana@centro.org' })
  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  email?: string;

  @ApiPropertyOptional({ example: 'Fonoaudiología', nullable: true, description: 'null removes it' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Ingrese la especialidad' })
  @Length(2, 80, { message: 'La especialidad debe tener entre 2 y 80 caracteres' })
  specialty?: string | null;

  @ApiPropertyOptional({ description: 'false = deactivate (not deleted)' })
  @IsOptional()
  @IsBoolean({ message: 'active debe ser true o false' })
  active?: boolean;
}

export class TemporaryPasswordDto {
  @ApiProperty({ example: 'Temporal2026', minLength: 10 })
  @IsString({ message: 'Ingrese la clave temporal' })
  @MaxLength(128, { message: 'La clave es demasiado larga' })
  @Matches(passwordPattern, { message: passwordMessage })
  temporaryPassword: string;
}

export class ReplacePatientsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray({ message: 'patientIds debe ser una lista' })
  @ArrayMaxSize(1000, { message: 'Demasiados pacientes' })
  @IsUUID('all', { each: true, message: 'Id de paciente no válido' })
  patientIds: string[];
}

export class CheckPinDto {
  @ApiProperty({ example: '4826' })
  @IsString({ message: 'Ingrese el PIN' })
  @Matches(pinPattern, { message: 'El PIN debe tener de 4 a 6 dígitos' })
  pin: string;
}
