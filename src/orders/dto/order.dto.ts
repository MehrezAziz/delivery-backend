import { IsString, IsNotEmpty, IsNumber, IsEnum, IsOptional, IsBoolean, Min } from 'class-validator';
import { PaymentType, OrderStatus, DeliveryZoneType } from '@prisma/client';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  pickupAddressId: string;

  @IsString()
  @IsNotEmpty()
  dropoffAddressId: string;

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
  nightFee: number;
  extraWeightFee: number;
  isNightDelivery: boolean;
  deliveryZoneType: DeliveryZoneType | null;
  createdAt: Date;
  pickupAddress: {
    id: string;
    street: string | null;
    latitude: number | null;
    longitude: number | null;
    delegation: {
      nameDelegation: string;
      governorate: {
        nameGovernorate: string;
        country: {
          name: string;
        };
      };
    };
  } | null;
  dropoffAddress: {
    id: string;
    street: string | null;
    latitude: number | null;
    longitude: number | null;
    delegation: {
      nameDelegation: string;
      governorate: {
        nameGovernorate: string;
        country: {
          name: string;
        };
      };
    };
  } | null;
  driverAssignment?: {
    id: string;
    driverId: string;
    acceptedAt: Date | null;
    driver: {
      userId: string;
      user: {
        firstName: string | null;
        secondName: string | null;
        phone: string;
      };
    };
  } | null;
}

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class AvailableOrdersResponseDto {
  sameDelegation: OrderResponseDto[];
  sameGovernorate: OrderResponseDto[];
  differentGovernorate: OrderResponseDto[];
  differentCountry: OrderResponseDto[];
}
