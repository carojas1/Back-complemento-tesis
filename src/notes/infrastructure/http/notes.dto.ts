import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { goalStatuses } from '../../domain/entities/note.entity';
import type { GoalStatus } from '../../domain/entities/note.entity';
import { CenterDayEnd, CenterDayStart } from '../../../common/time/center-day';
import { trim } from '../../../common/validation/trim';

const textRule = { message: 'Texto de 1 a 2000 caracteres' }; // FR-002

export class NotesQuery extends PaginationQuery {
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @CenterDayStart() @IsDate() from?: Date;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @CenterDayEnd() @IsDate() to?: Date;
}

export class CreateNoteDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 2000, textRule) text: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Session it refers to' }) @IsOptional() @IsUUID('4') sessionId?: string;
  @ApiPropertyOptional({ default: false, description: 'The guardian sees it (spec 112)' })
  @IsOptional()
  @IsBoolean()
  sharedWithFamily?: boolean;
}

export class ShareNoteDto {
  @ApiProperty({ description: 'true: the guardian sees it (spec 112 FR-004)' }) @IsBoolean() sharedWithFamily: boolean;
}

export class EditNoteDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 2000, textRule) text: string;
}

export class CreateGoalDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 2000, textRule) text: string;
  @ApiPropertyOptional({ example: '2026-12-15' }) @IsOptional() @Type(() => Date) @IsDate() targetDate?: Date;
}

export class UpdateGoalDto {
  @ApiPropertyOptional({ enum: goalStatuses }) @IsOptional() @IsIn(goalStatuses) status?: GoalStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(1, 2000, textRule) text?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() targetDate?: Date;
}
