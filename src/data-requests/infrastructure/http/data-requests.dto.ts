import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import type { DataRequestStatus, DataRequestType } from '../../domain/entities/data-request.entity';
import { trim } from '../../../common/validation/trim';

const types: DataRequestType[] = ['ACCESS', 'RECTIFICATION', 'DELETION'];
const statuses: DataRequestStatus[] = ['OPEN', 'DONE', 'REJECTED'];

export class CreateDataRequestDto {
  @ApiProperty({ enum: types }) @IsIn(types, { message: 'Tipo: ACCESS, RECTIFICATION o DELETION' }) type: DataRequestType;
  @ApiPropertyOptional({ maxLength: 2000, description: 'What the guardian asks for (e.g. which data to correct and why)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;
  @ApiPropertyOptional({ description: 'DELETION only: the guardian authorizes keeping anonymous sessions and events (default: no)' })
  @IsOptional()
  @IsBoolean()
  statisticalUseAllowed?: boolean;
}

export class DataRequestsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: statuses }) @IsOptional() @IsIn(statuses) status?: DataRequestStatus;
  @ApiPropertyOptional({ enum: types }) @IsOptional() @IsIn(types) type?: DataRequestType;
}

// Reason for the response (rectification done or rejection).
export class DataRequestNotesDto {
  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(1, 2000, { message: 'Escriba el motivo (hasta 2000 caracteres)' })
  notes: string;
}

export class ExecuteDeletionDto {
  @ApiProperty({ example: 'P-0007', description: 'Double confirmation: the patient code' })
  @IsString()
  @Length(1, 20)
  confirmCode: string;
}

export class DataRequestResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'P-0007' }) patientCode: string;
  @ApiProperty({ nullable: true, description: 'null if the patient was already deleted' }) patientId: string | null;
  @ApiProperty({ enum: types }) type: DataRequestType;
  @ApiProperty({ enum: statuses }) status: DataRequestStatus;
  @ApiProperty() requestedAt: Date;
  @ApiProperty({ description: 'requestedAt + 15 days (FR-002)' }) dueAt: Date;
  @ApiProperty({
    enum: ['OVERDUE', 'DUE_SOON', 'ON_TIME'],
    nullable: true,
    description: 'DUE_SOON: due in 3 days or less; null if already handled',
  })
  deadline: string | null;
  @ApiProperty({ nullable: true }) respondedAt: Date | null;
  @ApiProperty({ nullable: true }) handledBy: string | null;
  @ApiProperty({ nullable: true }) handledByName: string | null;
  @ApiProperty({ nullable: true }) notes: string | null;
  @ApiProperty({ nullable: true }) statisticalUseAllowed: boolean | null;
}
