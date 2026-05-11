import { IsIn, IsString, IsUUID } from 'class-validator';

export class NotifyFiatPayoutSentDto {
  @IsUUID()
  userId: string;

  @IsString()
  amount: string;

  @IsString()
  currency: string;

  @IsIn(['CASH', 'BANK_TRANSFER'])
  payoutMethod: 'CASH' | 'BANK_TRANSFER';

  @IsUUID()
  withdrawalRequestId: string;

  @IsIn(['WithdrawalRequest', 'DriverWithdrawalRequest'])
  relatedEntityType: 'WithdrawalRequest' | 'DriverWithdrawalRequest';
}
