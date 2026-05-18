import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  notifyReferralCommission?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGameEvents?: boolean;
}

export class NotificationPreferencesDto {
  notifyReferralCommission: boolean;
  notifyGameEvents: boolean;
}
