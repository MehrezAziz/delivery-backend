import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangeUserPasswordDto {
  /** Omit when the user just unlocked the Security screen (short server-side window). */
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class SecurityVerificationDocumentDto {
  /** Base64 data URL or raw base64 image */
  @IsString()
  @MinLength(32)
  image!: string;
}
