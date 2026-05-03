import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export enum ForgotPasswordChannelDto {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
}

/** Lookup saved email by account phone (E.164). */
export class ForgotPasswordEmailPreviewDto {
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be in E.164 format (e.g. +21612345678)' })
  phone!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

/** EMAIL / WHATSAPP / SMS — always identify the account by `phone` (E.164). Email code is sent to the saved profile email. */
export class ForgotPasswordRequestDto {
  @IsEnum(ForgotPasswordChannelDto)
  channel!: ForgotPasswordChannelDto;

  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be in E.164 format (e.g. +21612345678)' })
  phone!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class ForgotPasswordResendDto {
  @IsUUID()
  sessionId!: string;
}

export class ForgotPasswordVerifyCodeDto {
  @IsUUID()
  sessionId!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code!: string;
}

export class ForgotPasswordVerifyFirebaseDto {
  @IsString()
  idToken!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class ForgotPasswordResetDto {
  @IsString()
  resetToken!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
