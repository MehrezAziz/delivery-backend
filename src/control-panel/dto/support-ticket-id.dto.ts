import { IsUUID } from 'class-validator';

export class SupportTicketIdDto {
  @IsUUID()
  ticketId!: string;
}
