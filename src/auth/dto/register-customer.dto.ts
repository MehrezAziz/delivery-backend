import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  MinLength,
  Matches,
  MaxLength,
  Equals,
  IsBoolean,
} from 'class-validator';
import { UserGender } from '@prisma/client';

export class RegisterCustomerDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'Phone must be in international E.164 format with + and country code (e.g. +21655664488)',
  })
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  secondName?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsEnum(UserGender)
  userGender?: UserGender;

  @IsOptional()
  @IsEmail()
  myEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  @Matches(/^[A-Z0-9]+$/, { message: 'Referral code must contain only uppercase letters and numbers' })
  referralCode?: string;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the application terms' })
  acceptTerms!: boolean;
}
