import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDriverWithdrawalDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER'])
  payoutMethod?: 'CASH' | 'BANK_TRANSFER';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

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
}
