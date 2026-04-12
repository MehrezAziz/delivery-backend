import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { SupportTicketCategory, SupportTicketPriority } from '@prisma/client';

export class CreateTicketDto {
  @IsEnum(SupportTicketCategory)
  category!: SupportTicketCategory;

  @IsEnum(SupportTicketPriority)
  priority!: SupportTicketPriority;

  @IsString()
  description!: string;
}

export class SendMessageDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  image?: string;
}

export class AiFeedbackDto {
  @IsString()
  messageId!: string;

  @IsBoolean()
  helpful!: boolean;
}
