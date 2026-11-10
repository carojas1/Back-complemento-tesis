import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsOptional, IsString, Length, MaxDate } from 'class-validator';
import { trim } from '../../../common/validation/trim';

// Multipart: the fields arrive as text.
export class CreateVoiceDto {
  @ApiProperty({ example: 'Lucía Pérez' })
  @Transform(trim)
  @IsString()
  @Length(2, 80, { message: 'Nombre de 2 a 80 caracteres' })
  ownerName: string;
  @ApiProperty({ example: 'Madre' })
  @Transform(trim)
  @IsString()
  @Length(2, 40, { message: 'Parentesco de 2 a 40 caracteres' })
  relationship: string;

  @ApiProperty({ example: '2026-10-23' })
  @Type(() => Date)
  @IsDate({ message: 'Fecha del consentimiento no válida' })
  @MaxDate(() => new Date())
  consentDate: Date;

  @ApiProperty({ required: false, example: 'Hola, me llamo Lucía y te quiero mucho' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 300, { message: 'Transcripción de hasta 300 caracteres' })
  transcript?: string;

  @ApiProperty({ description: 'The therapist confirms she has the written consent of the person who owns the voice' })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  consentConfirmed: boolean;
}
