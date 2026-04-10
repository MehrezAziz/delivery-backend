import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class RegisterDriverStep3Dto {
  @IsEnum(DocumentType, {
    message: 'Document type must be PASSPORT, ID_CARD, or STUDENT_CARD',
  })
  documentType: DocumentType;

  @IsOptional()
  @IsString()
  livenessSession?: string;

  /** When `true`, use selfie + liveness JSON saved within the last 24h (liveness checkpoint). */
  @IsOptional()
  @IsIn(['true', 'false'])
  usePendingLiveness?: string;
}
