import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';

export class AuditQuery extends PaginationQuery {
  @ApiPropertyOptional({ format: 'uuid', description: 'User or tablet' }) @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional({ example: 'PATIENT_READ' }) @IsOptional() @IsString() @Length(1, 40) action?: string;
  @ApiPropertyOptional({ example: 'P-0001' }) @IsOptional() @IsString() @Length(1, 12) patientCode?: string;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}
