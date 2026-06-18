import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWithdrawalRequestDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER'])
  payoutMethod?: 'CASH' | 'BANK_TRANSFER';

  @IsOptional()
  @IsString()
  descriptionOfCustomer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  payoutBankHolderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  payoutBankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  payoutBankAccountRef?: string;

  @IsOptional()
  @IsBoolean()
  saveBankDetailsToProfile?: boolean;

  @IsOptional()
  @IsString()
  walletId?: string;

  @IsOptional()
  @IsString()
  countryId?: string;
}

export class CreateCountryWalletDto {
  @IsString()
  @IsNotEmpty()
  countryId: string;
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

export class UpdatePayoutBankDetailsDto {
  @IsString()
  @MaxLength(200)
  accountHolderName: string;

  @IsString()
  @MaxLength(200)
  bankName: string;

  @IsString()
  @MaxLength(120)
  accountReference: string;
}

export class WithdrawalRequestResponseDto {
  id: string;
  walletId: string;
  amount: number;
  status: string;
  payoutMethod?: string;
  payoutBankHolderName?: string | null;
  payoutBankName?: string | null;
  payoutBankAccountRef?: string | null;
  descriptionOfCustomer?: string | null;
  descriptionOfAdmin?: string | null;
  requestedAt: Date;
  processedAt?: Date | null;
}
