import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  IsISO8601,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Exactly 8 digits — optional for account security; required only when sending coins if a PIN is set. */
const PIN_8 = /^\d{8}$/;

export class SetTransferPinDto {
  @IsString()
  @Matches(PIN_8, { message: 'Transfer PIN must be exactly 8 digits' })
  transferPin!: string;

  /** Required when changing an existing PIN */
  @IsOptional()
  @IsString()
  @Matches(PIN_8, { message: 'Current transfer PIN must be exactly 8 digits' })
  oldTransferPin?: string;
}

export class VerifyTransferPinDto {
  @IsString()
  @Matches(PIN_8, { message: 'Transfer PIN must be exactly 8 digits' })
  transferPin!: string;
}

export class RemoveTransferPinDto {
  /** Omit only right after unlocking the Security screen (server-side window). */
  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim().length > 0)
  @Matches(PIN_8, { message: 'Current transfer PIN must be exactly 8 digits' })
  oldTransferPin?: string;
}

export class CreateTransferChallengeDto {
  /** Required only if you have configured a transfer PIN; omit when no PIN is set. */
  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim().length > 0)
  @Matches(PIN_8, { message: 'Transfer PIN must be exactly 8 digits' })
  transferPin?: string;

  /** Alternative to transfer PIN when authorizing a send (e.g. device has no biometrics). Do not send both PIN and password. */
  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim().length > 0)
  @MinLength(8, { message: 'Account password must be at least 8 characters' })
  @MaxLength(200)
  accountPassword?: string;
}

export class PreviewCoinTransferDto {
  /** Exactly one of recipientUserId or recipientPhone must be set. */
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v != null && String(v).trim().length > 0)
  @Matches(/^\+\d{10,15}$/, { message: 'Phone must be E.164 with country code (e.g. +21655664488)' })
  recipientPhone?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  grossCoins!: number;

  /** Customer multi-wallet: debit this wallet (must belong to sender). */
  @IsOptional()
  @IsUUID()
  walletId?: string;

  @IsOptional()
  @IsString()
  countryId?: string;
}

export class CreateCoinTransferDto {
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v != null && String(v).trim().length > 0)
  @Matches(/^\+\d{10,15}$/, { message: 'Phone must be E.164 with country code (e.g. +21655664488)' })
  recipientPhone?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  grossCoins!: number;

  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  giftMessage?: string;

  /** If set, transfer enters SCHEDULED until this instant (UTC), then PENDING with delay */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  /** Customer multi-wallet: debit this wallet (must belong to sender). */
  @IsOptional()
  @IsUUID()
  walletId?: string;

  @IsOptional()
  @IsString()
  countryId?: string;
}

export class ReportCoinTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Move a SCHEDULED send to a new instant (sender only). Must stay in the future. */
export class RescheduleCoinTransferDto {
  @IsISO8601()
  scheduledAt!: string;
}
