import { IsNumber, IsObject, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ReferralCodeDto } from './referral-code.dto';

export class ReferralStatisticsDto {
  @IsNumber()
  totalReferrals!: number;

  @IsNumber()
  totalCommission!: number;

  @IsNumber()
  pendingCommission!: number;

  @IsNumber()
  paidCommission!: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ReferralCodeDto)
  myReferralCode!: ReferralCodeDto | null;
}
