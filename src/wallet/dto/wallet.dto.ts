import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateWithdrawalRequestDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  descriptionOfCustomer?: string;
}

export class WalletResponseDto {
  id: string;
  customerId: string;
  balance: number;
  currency: string;
  discount: number;
  updatedAt: Date;
}

export class WalletTransactionResponseDto {
  id: string;
  walletId: string;
  orderId?: string | null;
  type: string;
  amount: number;
  status: string;
  referenceId?: string | null;
  referenceType?: string | null;
  balanceAfter: number;
  createdAt: Date;
}

export class WithdrawalRequestResponseDto {
  id: string;
  walletId: string;
  amount: number;
  status: string;
  descriptionOfCustomer?: string | null;
  descriptionOfAdmin?: string | null;
  requestedAt: Date;
  processedAt?: Date | null;
}
