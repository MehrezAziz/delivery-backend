import { IsString, IsNotEmpty, IsNumber, IsEnum, IsOptional, IsBoolean, IsInt, Min, Max, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType, OrderStatus, DeliveryZoneType } from '@prisma/client';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  pickupAddressId: string;

  @ValidateIf((o) => !o.localPickupOnly)
  @IsString()
  @IsNotEmpty()
  dropoffAddressId?: string;

  @IsBoolean()
  @IsOptional()
  localPickupOnly?: boolean;

  @IsEnum(PaymentType)
  @IsNotEmpty()
  paymentType: PaymentType;

  @IsNumber()
  @Min(0)
  weight: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isNightDelivery?: boolean;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  cancelAfterMinutes?: number;

  /** Extra amount (same currency as order) on top of calculated delivery price; optional, default 0. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000)
  customerExtraAmount?: number;
}

export class UpdateCancelAfterDto {
  @IsInt()
  @Min(15)
  @Max(1440)
  cancelAfterMinutes: number;
}

export class PreviewOrderDto {
  @IsString()
  @IsNotEmpty()
  pickupAddressId: string;

  @ValidateIf((o) => !o.localPickupOnly)
  @IsString()
  @IsNotEmpty()
  dropoffAddressId?: string;

  @IsBoolean()
  @IsOptional()
  localPickupOnly?: boolean;

  @IsEnum(PaymentType)
  @IsNotEmpty()
  paymentType: PaymentType;

  @IsNumber()
  @Min(0)
  weight: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000)
  customerExtraAmount?: number;
}

export class ChangePaymentMethodDto {
  @IsEnum(PaymentType)
  @IsNotEmpty()
  paymentType: PaymentType;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  @IsNotEmpty()
  status: OrderStatus;
}

export class UploadProofDto {
  @IsString()
  @IsNotEmpty()
  image1Proof: string;

  @IsString()
  @IsOptional()
  image2Proof?: string;
}

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class CreateDisputeDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RequestAssistanceDto {
  @IsString()
  @IsOptional()
  message?: string;
}

export class SendChatMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  image?: string;
}

export class RateOrderDto {
  @IsNumber()
  @Min(0)
  score: number; // 0-10

  @IsString()
  @IsOptional()
  comment?: string;
}

export class OrderResponseDto {
  id: string;
  customerId: string;
  status: OrderStatus;
  paymentType: PaymentType;
  description: string | null;
  weight: number;
  distanceKm: number;
  price: number;
  customerExtraAmount: number;
  nightFee: number;
  extraWeightFee: number;
  isNightDelivery: boolean;
  localPickupOnly: boolean;
  cancelAfterMinutes: number;
  deliveryZoneType: DeliveryZoneType | null;
  createdAt: Date;
  pickupAddress: any;
  dropoffAddress: any;
  driverAssignment?: any;
  chatRoom?: any;
  dispute?: any;
  rating?: any;
  driverAvailability?: {
    availableInDelegation: number | string;
    availableNearDelegationApprox: number | string;
  };
  urgentNotify?: {
    canStartNewCycle: boolean;
    nextButtonEnabledAt: string | null;
    wavesSentThisCycle: number;
    cycleInProgress: boolean;
  };
  arrivalConflict?: {
    id: string;
    status: string;
    customerReason: string;
    driverFeedback: string | null;
    createdAt: Date;
  } | null;
}

export class AvailableOrdersResponseDto {
  sameDelegation: OrderResponseDto[];
  sameGovernorate: OrderResponseDto[];
  differentGovernorate: OrderResponseDto[];
  differentCountry: OrderResponseDto[];
}
