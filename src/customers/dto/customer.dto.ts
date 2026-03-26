import { IsString, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { UserGender } from '@prisma/client';

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  secondName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  myEmail?: string;

  @IsEnum(UserGender)
  @IsOptional()
  userGender?: UserGender;

  @IsString()
  @IsOptional()
  image?: string;
}

export class CustomerResponseDto {
  id: string;
  userId: string;
  completedOrders: number;
  customerStatus: string;
  referredByCodeId: string | null;
  user: {
    id: string;
    phone: string;
    firstName: string | null;
    secondName: string | null;
    image: string | null;
    myEmail: string | null;
    userGender: string | null;
    role: string;
    createdAt: Date;
  };
  myReferralCode?: {
    id: string;
    code: string;
    type: string;
    value: number;
    active: boolean;
  } | null;
  referredByCode?: {
    id: string;
    code: string;
    type: string;
    value: number;
  } | null;
}

export class CustomerListResponseDto {
  id: string;
  userId: string;
  completedOrders: number;
  user: {
    phone: string;
    firstName: string | null;
    secondName: string | null;
  };
}

export class CustomerStatsDto {
  totalCustomers: number;
  activeCustomers: number;
  blockedCustomers: number;
  customersWithOrders: number;
  averageOrdersPerCustomer: number;
}
