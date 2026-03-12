import { IsString, IsEmail, IsEnum, IsOptional, MinLength, Matches, Length } from 'class-validator';
import { UserGender } from '@prisma/client';

export class RegisterDriverStep1Dto {
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone must be in E.164 format (e.g., +1234567890)',
  })
  phone: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  secondName?: string;

  @IsEmail({}, { message: 'Invalid email format' })
  @IsOptional()
  myEmail?: string;

  @IsEnum(UserGender, { message: 'Gender must be either MALE or FEMALE' })
  @IsOptional()
  userGender?: UserGender;

  @IsString()
  @Length(6, 12, { message: 'Referral code must be between 6 and 12 characters' })
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Referral code must contain only uppercase letters and numbers',
  })
  @IsOptional()
  referralCode?: string;
}
