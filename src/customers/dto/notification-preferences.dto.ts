import { IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  notifyReferralCommission: boolean;
}

export class NotificationPreferencesDto {
  notifyReferralCommission: boolean;
}
