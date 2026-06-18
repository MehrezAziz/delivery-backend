import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class InitFlouciTopUpDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(10)
  @Max(100_000)
  @Type(() => Number)
  coinsAmount!: number;

  @IsOptional()
  @IsString()
  walletId?: string;

  @IsOptional()
  @IsString()
  countryId?: string;
}

export class VerifyFlouciTopUpDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  paymentId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  trackingId?: string;
}
