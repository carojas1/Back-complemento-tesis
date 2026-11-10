import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDate, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import type { HomeworkStatus } from '../../domain/ports/homework.repository';
import { trim } from '../../../common/validation/trim';

const pictogramRule = { message: 'Elija de 1 a 12 pictogramas' }; // spec 112 FR-005

export class HomeworkQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ['pending', 'done'] }) @IsOptional() @IsIn(['pending', 'done']) status?: HomeworkStatus;
}

export class CreateHomeworkDto {
  @ApiProperty({ example: 'Repasen juntos las emociones antes de dormir.' })
  @Transform(trim)
  @IsString()
  @Length(1, 2000, { message: 'Instrucción de 1 a 2000 caracteres' })
  instructions: string;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Pictograms from the patient board' })
  @IsArray()
  @ArrayMinSize(1, pictogramRule)
  @ArrayMaxSize(12, pictogramRule)
  @IsUUID('all', { each: true })
  pictogramIds: string[];

  @ApiPropertyOptional({ example: '2026-11-02' }) @IsOptional() @Type(() => Date) @IsDate() dueDate?: Date;
  @ApiPropertyOptional({ default: false, description: '«identificar» activity with those pictograms' })
  @IsOptional()
  @IsBoolean()
  withActivity?: boolean;
}

export class UpdateHomeworkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 2000, { message: 'Instrucción de 1 a 2000 caracteres' })
  instructions?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, pictogramRule)
  @ArrayMaxSize(12, pictogramRule)
  @IsUUID('all', { each: true })
  pictogramIds?: string[];

  @ApiPropertyOptional({ nullable: true, description: 'null clears the due date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() withActivity?: boolean;
}
