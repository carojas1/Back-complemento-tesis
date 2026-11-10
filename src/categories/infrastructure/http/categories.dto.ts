import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { trim } from '../../../common/validation/trim';

const colorMessage = 'El color debe tener el formato #RRGGBB';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Emociones' })
  @Transform(trim)
  @IsString()
  @Length(1, 40, { message: 'El nombre debe tener entre 1 y 40 caracteres' })
  name: string;

  @ApiProperty({ example: '#64B5F6' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: colorMessage })
  color: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40, { message: 'El nombre debe tener entre 1 y 40 caracteres' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: colorMessage })
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'false = deactivate (not deleted)' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReplaceCategoryPictogramsDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'The array order is the order on the board' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true, message: 'Id de pictograma no válido' })
  pictogramIds: string[];
}

export class AddCategoryPictogramDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Id de pictograma no válido' })
  pictogramId: string;
}
