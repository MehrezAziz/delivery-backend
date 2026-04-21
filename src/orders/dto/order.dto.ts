import { IsString, IsNotEmpty, IsNumber, IsEnum, IsOptional, IsBoolean, IsInt, Min, Max, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType, OrderStatus, DeliveryZoneType, OrderSourceType } from '@prisma/client';

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
  @Type(() => Number)
  @IsInt()
  @ValidateIf((o) => !!o.localPickupOnly)
  @Max(240)
  @ValidateIf((o) => !o.localPickupOnly)
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
  @Type(() => Number)
  @IsInt()
  @Min(5)
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

  /** When moving to RETURNED or RETURN_DEPOSIT: optional call count and return-evidence image URL. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  customerCallCountBeforeReturn?: number;

  @IsOptional()
  @IsString()
  returnEvidenceImageUrl?: string;
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

export class ReturnDepositFeedbackDto {
  @IsString()
  @IsNotEmpty()
  feedback: string;

  @IsBoolean()
  @IsOptional()
  conditionIssue?: boolean;
}

export class OrderResponseDto {
  id: string;
  customerId: string;
  status: OrderStatus;
  paymentType: PaymentType;
  sourceType: OrderSourceType;
  deliveryCompanyId?: string | null;
  /** Company legal/display name when sourceType is DELIVERY_COMPANY. */
  deliveryCompanyName?: string | null;
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
  /** Snapshot of remaining seconds at response time (for display). */
  cancelRemainingSeconds: number;
  /**
   * Frozen timer budget (seconds) when the cancel timer last resumed; use with
   * `cancelTimerLastResumedAt` to compute live remaining (matches server logic).
   */
  cancelTimerRemainingSeconds: number | null;
  cancelTimerRunning: boolean;
  cancelTimerLastResumedAt: Date | null;
  deliveryZoneType: DeliveryZoneType | null;
  createdAt: Date;
  pickupAddress: any;
  dropoffAddress: any;
  driverAssignment?: any;
  chatRoom?: any;
  chatRooms?: Array<{
    id: string;
    driverId: string;
    status: string;
    createdAt: Date;
  }>;
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
  returnDepositFeedback?: {
    id: string;
    reportedByUserId: string;
    conditionIssue: boolean;
    feedback: string;
    createdAt: Date;
  } | null;
  /** Set for drivers: rejection row for this driver on this order (company/customer removal), with optional response. */
  myOrderDriverRejection?: {
    id: string;
    reason: string | null;
    driverResponse: string | null;
    driverRespondedAt: Date | null;
  } | null;
}

export class AvailableOrdersResponseDto {
  sameDelegation: OrderResponseDto[];
  sameGovernorate: OrderResponseDto[];
  differentGovernorate: OrderResponseDto[];
  differentCountry: OrderResponseDto[];
}
