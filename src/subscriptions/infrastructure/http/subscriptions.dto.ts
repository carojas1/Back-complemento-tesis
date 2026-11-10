import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxDate, MaxLength, Min } from 'class-validator';
import { annualPriceCents, paymentMethods } from '../../domain/entities/subscription.entity';
import type { PaymentMethod } from '../../domain/entities/subscription.entity';

const singleLine = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : value;

export class RecordPaymentDto {
  @ApiProperty({ example: annualPriceCents, description: 'Amount in cents (2.00 USD per year = 200)' })
  @Type(() => Number)
  @IsInt({ message: 'amountCents debe ser un número entero' })
  @Min(1, { message: 'amountCents debe ser positivo' })
  amountCents: number;

  @ApiProperty({ enum: paymentMethods })
  @IsIn(paymentMethods, { message: 'Elija la forma de pago' })
  method: PaymentMethod;

  @ApiPropertyOptional({ example: 'TRX-000123', maxLength: 120 })
  @IsOptional()
  @Transform(singleLine)
  @IsString()
  @MaxLength(120, { message: 'La referencia puede tener hasta 120 caracteres' })
  @Matches(/^[^<>\p{Cc}]*$/u, { message: 'No use < > ni caracteres de control' })
  reference?: string;

  @ApiPropertyOptional({ example: '2026-10-29', description: 'Defaults to now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'paidAt debe ser una fecha' })
  @MaxDate(() => new Date(Date.now() + 60_000), { message: 'La fecha de pago no puede estar en el futuro' })
  paidAt?: Date;
}

export class ConfigureSubscriptionDto {
  @ApiProperty({ example: annualPriceCents, description: 'Annual fee in cents' })
  @Type(() => Number)
  @IsInt({ message: 'priceCents debe ser un número entero' })
  @Min(1, { message: 'La cuota debe ser mayor que cero' })
  @Max(1_000_000, { message: 'La cuota es demasiado alta' })
  priceCents: number;
}
