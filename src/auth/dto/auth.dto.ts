// ============================================
// USER AUTH DTOs (Customer & Driver - Phone OTP)
// ============================================

import {
  IsString,
  IsPhoneNumber,
  IsEnum,
  IsOptional,
  IsEmail,
  MinLength,
  Matches,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class SendOtpDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phone!: string;

  @IsEnum(UserRole)
  role!: UserRole; // CUSTOMER or DRIVER
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otp!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class UserLoginDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class UserRegisterDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  secondName?: string;

  @IsOptional()
  @IsEmail()
  myEmail?: string;
}

export class CompleteUserProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  secondName?: string;

  @IsOptional()
  @IsEmail()
  myEmail?: string;

  @IsOptional()
  @IsString()
  image?: string;
}

// ============================================
// SUPER USER AUTH DTOs (Admin & CustomerService - Email/Password)
// ============================================

export class SuperUserLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class SuperUserRefreshDto {
  @IsString()
  refreshToken!: string;
}

// ============================================
// RESPONSE DTOs
// ============================================

export class AuthTokensDto {
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
}

export class OtpResponseDto {
  message!: string;
  expiresInSeconds!: number;
  // Only in development mode
  otp?: string;
}


// ============================================
// GOOGLE OAUTH DTOs
// ============================================

export class GoogleAuthDto {
  @IsString()
  idToken!: string; // Google ID token from frontend

  @IsEnum(UserRole)
  role!: UserRole; // CUSTOMER or DRIVER

  @IsOptional()
  @IsString()
  referralCode?: string; // Optional referral code for customer registration

  @IsOptional()
  isLoginOnly?: boolean; // If true, reject if account doesn't exist (login screen)
}
