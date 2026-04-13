import { IsIn, IsString, IsUUID } from 'class-validator';

export class TriggerCustomerNotificationDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @IsIn(['ACCOUNT_SUSPENDED'])
  type!: string;
}
