import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';

export class ListNotificationsQuery extends PaginationQuery {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Everything in a query arrives as text.
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'unreadOnly debe ser true o false' })
  unreadOnly?: boolean;
}
