import { IsString, IsNotEmpty, IsNumber, IsEnum, IsBoolean, IsOptional, Min } from 'class-validator';
import { DeliveryZoneType } from '@prisma/client';

export class CreatePricingPolicyDto {
  @IsString()
  @IsNotEmpty()
  countryId: string;

  @IsEnum(DeliveryZoneType)
  @IsNotEmpty()
  deliveryZoneType: DeliveryZoneType;

  @IsNumber()
  @Min(0)
  pricePerKm: number;

  @IsNumber()
  @Min(0)
  baseFee: number;

  @IsNumber()
  @Min(0)
  baseWeight: number;

  @IsNumber()
  @Min(0)
  extraWeightStep: number;

  @IsNumber()
  @Min(0)
  extraWeightPrice: number;

  @IsNumber()
  @Min(0)
  nightFee: number;

  @IsNumber()
  @Min(0)
  platformFee: number;

  @IsNumber()
  @Min(0)
  maxNegativeDays: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePricingPolicyDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerKm?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseWeight?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  extraWeightStep?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  extraWeightPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  nightFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  platformFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxNegativeDays?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
