import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';

export class SyncProfilesQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Version the tablet already has (0 = everything)', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since: number = 0;
}

class SessionDto {
  @IsUUID() id: string;
  @IsString() @Length(6, 12) patientCode: string;
  @IsOptional() @IsUUID() therapistId?: string | null;
  @IsOptional() @IsBoolean() therapistVerified?: boolean;
  @IsInt() @Min(0) profileVersion: number;
  @Type(() => Date) @IsDate() startedAt: Date;
  @IsOptional() @Type(() => Date) @IsDate() endedAt?: Date | null;
  // Home practice only (POST /family/practice, spec 112); ignored in /sync/batch.
  @IsOptional() @IsUUID() homeworkId?: string | null;
}

class EventDto {
  @IsUUID() id: string;
  @IsUUID() sessionId: string;
  @IsString() @Length(1, 40) type: string;
  @IsObject() payload: Record<string, unknown>;
  @Type(() => Date) @IsDate() occurredAt: Date;
}

class ActivityRunDto {
  @IsUUID() id: string;
  @IsUUID() sessionId: string;
  @IsString() @Length(1, 40) type: string;
  @IsInt() @Min(1) @Max(3) level: number;
  @Type(() => Date) @IsDate() startedAt: Date;
  @IsOptional() @Type(() => Date) @IsDate() endedAt?: Date | null;
}

class ActivityResultDto {
  @IsUUID() id: string;
  @IsUUID() runId: string;
  @IsUUID() targetPictogramId: string;
  @IsUUID() chosenPictogramId: string;
  @IsBoolean() correct: boolean;
  @IsBoolean() firstAttempt: boolean;
  @IsInt() @Min(0) responseMs: number;
  @Type(() => Date) @IsDate() answeredAt: Date;
}

// The cap of 100 in total is checked by the use case (413); here, a cap per list so garbage is not processed.
export class SyncBatchDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SessionDto)
  sessions: SessionDto[] = [];
  @ApiProperty({ type: [Object] }) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => EventDto) events: EventDto[] =
    [];
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ActivityRunDto)
  activityRuns: ActivityRunDto[] = [];
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ActivityResultDto)
  activityResults: ActivityResultDto[] = [];
}
