import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { passwordPattern, pinPattern } from '../../domain/entities/user.entity';
import { trim } from '../../../common/validation/trim';

// Strips spaces pasted along with a copy (e.g. ' ana@centro.org ').

export class ChangePasswordDto {
  @ApiProperty({ example: 'ClaveTemporal1' })
  @IsString({ message: 'Ingrese la contraseña actual' })
  @MinLength(1, { message: 'Ingrese la contraseña actual' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga' })
  currentPassword: string;

  @ApiProperty({ example: 'NuevaClave2026', minLength: 10 })
  @IsString({ message: 'Ingrese la contraseña nueva' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga' })
  @Matches(passwordPattern, { message: 'La contraseña debe tener al menos 10 caracteres, con letras y números' })
  newPassword: string;
}

export class SetPinDto {
  @ApiProperty({ example: 'Contrasena123' })
  @IsString({ message: 'Ingrese su contraseña' })
  @MinLength(1, { message: 'Ingrese su contraseña' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga' })
  currentPassword: string;

  @ApiProperty({ example: '4826', description: '4 to 6 digits, no sequences like 1111 or 1234' })
  @IsString({ message: 'Ingrese el PIN' })
  @Matches(pinPattern, { message: 'El PIN debe tener de 4 a 6 dígitos' })
  pin: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'fono@centro.org' })
  @Transform(trim)
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  email: string;
}

// Mobile app only (with X-App-Key): the refresh token travels in the body because it does not keep `Secure` cookies.
export class RefreshDto {
  @ApiPropertyOptional({ description: 'Refresh token (mobile app only; the web uses the cookie)' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'fono@centro.org' })
  @Transform(trim)
  @IsEmail({}, { message: 'Ingrese un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  email: string;

  @ApiProperty({ example: 'Contrasena123' })
  @IsString({ message: 'Ingrese la contraseña' })
  @MinLength(1, { message: 'Ingrese la contraseña' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga' })
  password: string;

  @ApiPropertyOptional({ description: 'Only after 409 ChooseInstitution: the chosen institution (spec 113)' })
  @IsOptional()
  @IsUUID('all', { message: 'Institución no válida' })
  institutionId?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received by e-mail' })
  @IsString({ message: 'Falta el token' })
  @MaxLength(256, { message: 'Token no válido' })
  token: string;

  @ApiProperty({ example: 'NuevaClave2026', minLength: 10 })
  @IsString({ message: 'Ingrese la contraseña nueva' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga' })
  @Matches(passwordPattern, { message: 'La contraseña debe tener al menos 10 caracteres, con letras y números' })
  newPassword: string;
}
