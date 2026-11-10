import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { wordTypes } from '../../domain/entities/pictogram.entity';
import type { WordType } from '../../domain/entities/pictogram.entity';
import { trim } from '../../../common/validation/trim';

export class PictogramSearchQuery extends PaginationQuery {
  @ApiPropertyOptional({ example: 'agua', description: 'No word: all the saved ones' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 60, { message: 'Ingrese hasta 60 caracteres' })
  q?: string;
}

export class ArasaacSearchQuery extends PaginationQuery {
  @ApiProperty({ example: 'agua' })
  @Transform(trim)
  @IsString()
  @Length(1, 60, { message: 'Ingrese de 1 a 60 caracteres' })
  q: string;
}

export class ImportArasaacDto {
  @ApiProperty({ example: 2248 })
  @Type(() => Number)
  @IsInt({ message: 'arasaacId debe ser un número' })
  @Min(1)
  arasaacId: number;

  @ApiPropertyOptional({ description: 'Own label; if missing, the ARASAAC word' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  label?: string;
}

export class UploadPictogramDto {
  @ApiProperty({ example: 'Mi perro' })
  @Transform(trim)
  @IsString()
  @Length(1, 60, { message: 'La etiqueta debe tener entre 1 y 60 caracteres' })
  label: string;

  @ApiPropertyOptional({ enum: wordTypes, description: 'Word type (without it, it stays unclassified)' })
  @IsOptional()
  @IsIn(wordTypes)
  wordType?: WordType;
}

export class UpdatePictogramDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  label?: string;

  @ApiPropertyOptional({ description: 'false = deactivate (not deleted)' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ enum: wordTypes, nullable: true, description: 'Word type; null = unclassified' })
  @IsOptional()
  @IsIn([...wordTypes, null])
  wordType?: WordType | null;
}
