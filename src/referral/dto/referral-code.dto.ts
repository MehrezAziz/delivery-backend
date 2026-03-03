import { ReferralCodeType } from '@prisma/client';
import { IsString, IsEnum, IsNumber, IsBoolean, IsOptional, IsDate, IsInt } from 'class-validator';

export class ReferralCodeDto {
  @IsString()
  id!: string;

  @IsString()
  code!: string;

  @IsEnum(ReferralCodeType)
  type!: ReferralCodeType;

  @IsNumber()
  value!: number;

  @IsOptional()
  @IsNumber()
  maxDiscountAmount?: number;

  @IsOptional()
  @IsNumber()
  minOrderAmount?: number;

  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsDate()
  validFrom?: Date;

  @IsOptional()
  @IsDate()
  validUntil?: Date;

  @IsOptional()
  @IsInt()
  usageLimit?: number;

  @IsInt()
  totalUses!: number;
}
