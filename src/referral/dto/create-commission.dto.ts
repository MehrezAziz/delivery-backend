import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class CreateCommissionDto {
  @IsString()
  @IsNotEmpty()
  referralCodeId!: string;

  @IsString()
  @IsNotEmpty()
  referrerCustomerId!: string;

  @IsString()
  @IsNotEmpty()
  referredCustomerId!: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsNumber()
  @IsPositive()
  commissionAmount!: number;
}
