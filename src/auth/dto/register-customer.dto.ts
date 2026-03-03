import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  MinLength,
  Matches,
  MaxLength,
} from 'class-validator';
import { UserGender } from '@prisma/client';

export class RegisterCustomerDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
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
}
