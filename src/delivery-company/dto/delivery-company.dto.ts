import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeliveryCompanyRefundDestinationType, DeliveryCompanyStatus, PaymentType } from '@prisma/client';

export class CreateDeliveryCompanyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  passwordHash?: string;

  @IsString()
  @IsOptional()
  legalName?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  proxyCustomerId?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  maxNegativeBalance?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  defaultDiscountPercent?: number;
}

export class UpdateDeliveryCompanyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  passwordHash?: string;

  @IsString()
  @IsOptional()
  legalName?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  proxyCustomerId?: string;

  @IsEnum(DeliveryCompanyStatus)
  @IsOptional()
  status?: DeliveryCompanyStatus;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  maxNegativeBalance?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  defaultDiscountPercent?: number;
}

export class CreateDeliveryCompanyApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scopes?: string[];

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class CreateDeliveryCompanyOrderDto {
  @IsString()
  @IsNotEmpty()
  pickupAddressId: string;

  @IsString()
  @IsOptional()
  dropoffAddressId?: string;

  @IsString()
  @IsOptional()
  dropoffGovernorateId?: string;

  @IsString()
  @IsOptional()
  dropoffDelegationId?: string;

  @IsString()
  @IsOptional()
  dropoffStreet?: string;

  @IsBoolean()
  @IsOptional()
  localPickupOnly?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight: number;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000)
  @IsOptional()
  customerExtraAmount?: number;
}

export class CreateDeliveryCompanyAddressDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class CreateDeliveryCompanyRefundRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountCoins: number;

  @IsEnum(DeliveryCompanyRefundDestinationType)
  destinationType: DeliveryCompanyRefundDestinationType;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class CompanyOrderPreviewResponseDto {
  paymentType: PaymentType;
  effectiveDiscountPercent: number;
  calculatedPrice: number;
  discountedPrice: number;
  customerExtraAmount: number;
  weightKg: number;
  distanceKm: number;
  billingDistanceKm: number;
  pricePerKm: number;
  nightFee: number;
  totalPrice: number;
  reserveAmount: number;
  requiredCapacity: number;
}
