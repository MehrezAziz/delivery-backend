import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';

export class NotifyFiatPayoutRejectedDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(1)
  reason: string;

  @IsString()
  amount: string;

  @IsIn(['WithdrawalRequest', 'DriverWithdrawalRequest'])
  relatedEntityType: 'WithdrawalRequest' | 'DriverWithdrawalRequest';

  @IsUUID()
  withdrawalRequestId: string;
}
