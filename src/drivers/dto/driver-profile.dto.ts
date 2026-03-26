import { DriverStatus, UserGender, DocumentType, VerificationStatus } from '@prisma/client';

export class DriverProfileDto {
  id: string;
  userId: string;
  vehicleType?: string;
  status: DriverStatus;
  description?: string;
  approvedAt?: Date;
  suspendedAt?: Date;
  user: {
    id: string;
    phone: string;
    firstName?: string;
    secondName?: string;
    image?: string;
    myEmail?: string;
    userGender?: UserGender;
    hasPassword?: boolean;
  };
  driverLocation?: {
    latitude: number;
    longitude: number;
  };
  verification?: {
    documentType: DocumentType;
    submittedAt?: Date;
    verifiedAt?: Date;
    document?: {
      verificationStatus: VerificationStatus;
    };
  };
  account?: {
    balance: number;
    currency: string;
    completedDeliveries: number;
    negativeBalanceSince?: Date;
    daysRemainingToPay?: number;
    maxNegativeDays?: number;
  };
}
