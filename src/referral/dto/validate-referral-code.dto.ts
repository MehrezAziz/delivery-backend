import { IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';

export class ValidateReferralCodeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(12)
  @Matches(/^[A-Z0-9]+$/, { message: 'Referral code must contain only uppercase letters and numbers' })
  code!: string;
}
