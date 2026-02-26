import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  myReferralCodeId?: string;
}

export class CustomerResponseDto {
  id: string;
  userId: string;
  completedOrders: number;
  myReferralCodeId: string | null;
  referredByCodeId: string | null;
  user: {
    id: string;
    phone: string;
    firstName: string | null;
    secondName: string | null;
    image: string | null;
    myEmail: string | null;
    status: string;
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
    status: string;
  };
}

export class CustomerStatsDto {
  totalCustomers: number;
  activeCustomers: number;
  blockedCustomers: number;
  customersWithOrders: number;
  averageOrdersPerCustomer: number;
}
