import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import type { PatientUsageFlag, PatientUsageSort } from '../../domain/ports/dashboard.read-model';

export class OverviewQuery {
  @ApiPropertyOptional({ example: '2026-10-29T05:00:00Z', description: "Local midnight of the panel (defaults to Ecuador's)" })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'dayStart debe ser una fecha' })
  dayStart?: Date;
}

// The period and the person every metric can be read by.
class PeriodFilter {
  @ApiPropertyOptional({ example: '2026-10-01T05:00:00Z', description: 'Defaults to 30 days ago' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'from debe ser una fecha' })
  from?: Date;

  @ApiPropertyOptional({ example: '2026-11-01T05:00:00Z', description: 'Por defecto, ahora' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'to debe ser una fecha' })
  to?: Date;

  @ApiPropertyOptional({ format: 'uuid', description: 'Ignored for the specialist' })
  @IsOptional()
  @IsUUID('4', { message: 'therapistId debe ser un UUID' })
  therapistId?: string;
}

export class AnalyticsQuery extends PeriodFilter {
  @ApiPropertyOptional({ example: 'Fonoaudiología' })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'La especialidad puede tener hasta 80 caracteres' })
  specialty?: string;
}

export class AppUsageQuery extends PeriodFilter {}

export class PatientUsageQuery extends IntersectionType(PaginationQuery, PeriodFilter) {
  @ApiPropertyOptional({ example: 'P-0001', description: 'Code, first names or last names' })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'La búsqueda puede tener hasta 80 caracteres' })
  search?: string;

  @ApiPropertyOptional({ enum: ['NO_PRACTICE', 'NO_SHOWS'] })
  @IsOptional()
  @IsIn(['NO_PRACTICE', 'NO_SHOWS'], { message: 'flag no es válido' })
  flag?: PatientUsageFlag;

  @ApiPropertyOptional({ enum: ['CODE', 'MINUTES', 'LAST_SESSION', 'NO_SHOWS'], default: 'CODE' })
  @IsOptional()
  @IsIn(['CODE', 'MINUTES', 'LAST_SESSION', 'NO_SHOWS'], { message: 'sort no es válido' })
  sort?: PatientUsageSort;
}
