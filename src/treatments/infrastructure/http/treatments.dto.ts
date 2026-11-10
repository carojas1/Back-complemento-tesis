import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';

const optionalText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.normalize('NFC').trim() || undefined : value);

export class SaveTreatmentPlanDto {
  @ApiProperty({ example: 12, minimum: 1, maximum: 500 })
  @Type(() => Number)
  @IsInt({ message: 'Ingrese el número de sesiones prescritas' })
  @Min(1, { message: 'Prescriba al menos una sesión' })
  @Max(500, { message: 'No se pueden prescribir más de 500 sesiones' })
  prescribedSessions: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(500, { message: 'Las notas pueden tener hasta 500 caracteres' })
  @Matches(/^(?:[^<>\p{Cc}]|[\n\r\t])*$/u, { message: 'No use < > ni caracteres de control' })
  notes?: string;
}

export class TreatmentProgressQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Patient code; also their name for the specialist' })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(80, { message: 'La búsqueda puede tener hasta 80 caracteres' })
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Ignored for the specialist' })
  @IsOptional()
  @IsUUID('4', { message: 'therapistId debe ser un UUID' })
  therapistId?: string;

  @ApiPropertyOptional({ example: 'Fonoaudiología' })
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(80, { message: 'La especialidad puede tener hasta 80 caracteres' })
  specialty?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISCHARGED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISCHARGED'], { message: 'status debe ser ACTIVE o DISCHARGED' })
  status?: 'ACTIVE' | 'DISCHARGED';
}
