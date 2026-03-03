import { UserRole, UserGender, CustomerStatus } from '@prisma/client';
import { ReferralCodeDto } from '../../referral/dto/referral-code.dto';

export class UserDto {
  id!: string;
  phone!: string;
  firstName?: string | null;
  secondName?: string | null;
  image?: string | null;
  myEmail?: string | null;
  userGender?: UserGender | null;
  role!: UserRole;
  createdAt!: Date;
}

export class CustomerDto {
  id!: string;
  userId!: string;
  completedOrders!: number;
  customerStatus!: CustomerStatus;
  referredByCodeId?: string | null;
}

export class RegisterCustomerResponseDto {
  accessToken!: string;
  user!: UserDto;
  customer!: CustomerDto;
  referralCode!: ReferralCodeDto;
}
