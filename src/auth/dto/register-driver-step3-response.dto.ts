import { DocumentType, VerificationStatus } from '@prisma/client';

export class RegisterDriverStep3ResponseDto {
  driverVerification: {
    id: string;
    driverId: string;
    documentType: DocumentType;
    submittedAt: Date;
  };
  document: {
    id: string;
    verificationId: string;
    selfieImage: string;
    docImageTop: string;
    docImageBottom?: string;
    verificationStatus: VerificationStatus;
  };
  driver: {
    id: string;
    status: 'PENDING_REVIEW';
  };
  message: string;
}
