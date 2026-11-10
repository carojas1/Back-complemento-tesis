import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { pinPattern } from '../../../auth/domain/entities/user.entity';
import { trim } from '../../../common/validation/trim';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'Centro de Fonoaudiología Cuenca' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Ingrese el nombre del centro' })
  @MaxLength(80, { message: 'El nombre del centro puede tener hasta 80 caracteres' })
  centerName?: string;

  @ApiPropertyOptional({ example: 5, description: 'Minutes of inactivity before leaving therapist mode (1 to 30)' })
  @IsOptional()
  @IsInt({ message: 'Ingrese un número de minutos' })
  @Min(1, { message: 'El modo terapeuta dura de 1 a 30 minutos' })
  @Max(30, { message: 'El modo terapeuta dura de 1 a 30 minutos' })
  therapistTimeoutMinutes?: number;

  @ApiPropertyOptional({ example: 15, description: 'Minutes a registration code stays valid (5 to 60)' })
  @IsOptional()
  @IsInt({ message: 'Ingrese un número de minutos' })
  @Min(5, { message: 'Un código de registro dura de 5 a 60 minutos' })
  @Max(60, { message: 'Un código de registro dura de 5 a 60 minutos' })
  registrationCodeMinutes?: number;
}

export class SetCenterPinDto {
  @ApiPropertyOptional({ example: '2580', description: 'The current Center PIN (required if one already exists)' })
  @IsOptional()
  @IsString()
  @Matches(pinPattern, { message: 'El PIN del Centro actual debe tener de 4 a 6 dígitos' })
  currentPin?: string;

  @ApiProperty({ example: '3691', description: '4 to 6 digits, no sequences like 1111 or 1234' })
  @IsString({ message: 'Ingrese el PIN del Centro' })
  @Matches(pinPattern, { message: 'El PIN del Centro debe tener de 4 a 6 dígitos' })
  pin: string;
}
