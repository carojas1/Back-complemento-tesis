import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsIn, IsOptional } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import type { HomeworkStatus } from '../../../homework/domain/ports/homework.repository';
import { CenterDayEnd, CenterDayStart } from '../../../common/time/center-day';

export class FamilySessionsQuery extends PaginationQuery {
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @CenterDayStart() @IsDate() from?: Date;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @CenterDayEnd() @IsDate() to?: Date;
}

export class FamilyHomeworkQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ['pending', 'done'] }) @IsOptional() @IsIn(['pending', 'done']) status?: HomeworkStatus;
}
