import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { activityTypes, voices } from '../../domain/entities/profile.entity';

export class UpdateProfileDto {
  @ApiPropertyOptional({ enum: [4, 6, 9, 12] })
  @IsOptional()
  @IsIn([4, 6, 9, 12], { message: 'La cuadrícula es de 4, 6, 9 o 12 celdas' })
  gridSize?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  activityLevel?: number;

  @ApiPropertyOptional({ minimum: 0.5, maximum: 1.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  speechRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sentenceBarEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 5, maximum: 20, description: 'Prompts per activity (spec 007)' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(20)
  activityPrompts?: number;

  @ApiPropertyOptional({ minimum: 5, maximum: 60, description: 'Seconds without an answer before repeating the word' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  activityRepeatSeconds?: number;

  @ApiPropertyOptional({ type: [String], enum: activityTypes })
  @IsOptional()
  @IsArray()
  @IsIn(activityTypes, { each: true })
  activityTypes?: string[];

  @ApiPropertyOptional({ enum: voices, description: 'SYSTEM: system voice; CLONED: cloned voice of the patient (spec 010)' })
  @IsOptional()
  @IsIn(voices)
  voice?: string;
}

export class AddCategoryDto {
  @ApiProperty({ format: 'uuid', description: 'Category from the Center catalog' }) @IsUUID('4') categoryId: string;
}

export class OrderDto {
  @ApiProperty({ type: [String], description: 'All current ids in the new order' })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class AddPictogramDto {
  @ApiProperty({ format: 'uuid', description: 'Pictogram from the Center catalog' }) @IsUUID('4') pictogramId: string;
}

export class SetPictogramHiddenDto {
  @ApiPropertyOptional({ description: 'true: the pictogram does not appear on the patient board' })
  @IsBoolean()
  hidden: boolean;
}
