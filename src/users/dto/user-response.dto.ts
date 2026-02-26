import { UserRole, UserStatus } from '@prisma/client';

export class UserResponseDto {
  id: string;
  phone: string;
  firstName: string | null;
  secondName: string | null;
  photo: string | null;
  myEmail: string | null;
  image: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  customer?: {
    id: string;
    completedOrders: number;
  };
  driver?: {
    id: string;
    status: string;
    vehicleType: string | null;
    description: string | null;
    approvedAt: Date | null;
    suspendedAt: Date | null;
  };
}
