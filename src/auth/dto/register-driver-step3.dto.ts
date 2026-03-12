import { IsEnum } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class RegisterDriverStep3Dto {
  @IsEnum(DocumentType, {
    message: 'Document type must be PASSPORT, ID_CARD, or STUDENT_CARD',
  })
  documentType: DocumentType;
}
