import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { DocumentType, VerificationStatus, DriverStatus } from '@prisma/client';

export class UploadDocumentsDto {
  @IsEnum(DocumentType)
  @IsNotEmpty()
  documentType: DocumentType;

  @IsString()
  @IsNotEmpty()
  documentImage: string;

  @IsString()
  @IsNotEmpty()
  selfieImage: string;

  @IsString()
  @IsOptional()
  docImageTop?: string;

  @IsString()
  @IsOptional()
  docImageBottom?: string;
}

export class DocumentResponseDto {
  id: string;
  documentImage: string | null;
  selfieImage: string | null;
  docImageTop: string | null;
  docImageBottom: string | null;
  verificationStatus: VerificationStatus;
  selfieVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  idNumber: string | null;
  dateOfBirth: Date | null;
  /** BCP 47 locale used for `translationData` (e.g. en). */
  translationLocale: string | null;
  /** Google Translation payload for staff review; see `DocumentTranslationPayload`. */
  translationData: Record<string, unknown> | null;
  /** Populated when ML_VERIFY_ENABLED and Python pipeline runs; see MlVerificationService */
  mlAnalysis?: Record<string, unknown> | null;
}

export class DriverVerificationResponseDto {
  driverId: string;
  status: DriverStatus;
  documentType: DocumentType | null;
  submittedAt: Date | null;
  verifiedAt: Date | null;
  approvedAt: Date | null;
  suspendedAt: Date | null;
  documents: DocumentResponseDto[];
}

export class RejectDriverDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class SuspendDriverDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
