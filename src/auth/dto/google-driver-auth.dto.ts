import { IsString, IsOptional, Length, Matches } from 'class-validator';

export class GoogleDriverAuthDto {
  @IsString()
  idToken: string;

  @IsString()
  @Length(6, 12, { message: 'Referral code must be between 6 and 12 characters' })
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Referral code must contain only uppercase letters and numbers',
  })
  @IsOptional()
  referralCode?: string;
}
