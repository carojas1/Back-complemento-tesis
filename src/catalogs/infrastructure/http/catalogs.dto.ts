import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { trim } from '../../../common/validation/trim';

const nameMessage = 'El nombre debe tener entre 1 y 60 caracteres';

export class ListCatalogQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'true: only the ones that can be chosen' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}

export class CreateCatalogItemDto {
  @ApiProperty({ example: 'Trastorno del lenguaje' })
  @Transform(trim)
  @IsString()
  @Length(1, 60, { message: nameMessage })
  name: string;
}

export class UpdateCatalogItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60, { message: nameMessage })
  name?: string;

  @ApiPropertyOptional({ description: 'false = deja de ofrecerse' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
