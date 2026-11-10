import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';

const singleLine = /^[^<>\p{Cc}]*$/u;
const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : value);
const asBoolean = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class ListRoomsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'true = only the active ones' })
  @IsOptional()
  @Transform(asBoolean)
  @IsBoolean({ message: 'active debe ser true o false' })
  active?: boolean;
}

export class CreateRoomDto {
  @ApiProperty({ example: 'Consultorio 1', maxLength: 60 })
  @Transform(trimmed)
  @IsString({ message: 'Ingrese el nombre del consultorio' })
  @Length(1, 60, { message: 'El nombre debe tener entre 1 y 60 caracteres' })
  @Matches(singleLine, { message: 'No use < > ni caracteres de control' })
  name: string;
}

export class UpdateRoomDto {
  @ApiPropertyOptional({ example: 'Consultorio 1', maxLength: 60 })
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Ingrese el nombre del consultorio' })
  @Length(1, 60, { message: 'El nombre debe tener entre 1 y 60 caracteres' })
  @Matches(singleLine, { message: 'No use < > ni caracteres de control' })
  name?: string;

  @ApiPropertyOptional({ description: 'false = deactivate (not deleted)' })
  @IsOptional()
  @IsBoolean({ message: 'active debe ser true o false' })
  active?: boolean;
}

export class CenterHoursEntryDto {
  @ApiProperty({ example: 1, description: '0 = domingo' })
  @IsInt({ message: 'weekday debe ser un número' })
  @Min(0, { message: 'weekday va de 0 a 6' })
  @Max(6, { message: 'weekday va de 0 a 6' })
  weekday: number;

  @ApiProperty({ example: 480, description: 'Minutes since local midnight' })
  @IsInt({ message: 'opensAt debe ser un número' })
  @Min(0, { message: 'opensAt va de 0 a 1440' })
  @Max(1440, { message: 'opensAt va de 0 a 1440' })
  opensAt: number;

  @ApiProperty({ example: 1020 })
  @IsInt({ message: 'closesAt debe ser un número' })
  @Min(0, { message: 'closesAt va de 0 a 1440' })
  @Max(1440, { message: 'closesAt va de 0 a 1440' })
  closesAt: number;
}

export class ReplaceCenterHoursDto {
  @ApiProperty({ type: [CenterHoursEntryDto], description: 'The whole week: a day that does not appear is closed' })
  @IsArray({ message: 'hours debe ser una lista' })
  @ArrayMaxSize(7, { message: 'Una semana tiene 7 días' })
  @ValidateNested({ each: true })
  @Type(() => CenterHoursEntryDto)
  hours: CenterHoursEntryDto[];
}
