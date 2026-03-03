import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class UpdateCustomerDto {
  // Customer fields are now managed through relations
  // No direct fields to update on Customer model
}

export class CustomerResponseDto {
  id: string;
  userId: string;
  completedOrders: number;
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
