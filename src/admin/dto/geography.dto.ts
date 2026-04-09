import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsNumber, Min, MaxLength, Matches } from 'class-validator';

// Country DTOs
export class CreateCountryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  isoCode: string;

  @IsString()
  @IsNotEmpty()
  currencyCode: string;

  @IsString()
  @IsNotEmpty()
  currencySymbol: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** BCP 47 / ISO 639-1 style tag for driver UX (liveness voice, etc.), e.g. `ar`, `fr`, `en`. */
  @IsOptional()
  @IsString()
  @MaxLength(12)
  @Matches(/^[a-z]{2}(-[A-Za-z0-9]{1,8})*$/, {
    message: 'language must look like a locale tag (e.g. ar, fr, en-US)',
  })
  language?: string | null;
}

export class UpdateCountryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  isoCode?: string;

  @IsString()
  @IsOptional()
  currencyCode?: string;

  @IsString()
  @IsOptional()
  currencySymbol?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  @Matches(/^[a-z]{2}(-[A-Za-z0-9]{1,8})*$/, {
    message: 'language must look like a locale tag (e.g. ar, fr, en-US)',
  })
  language?: string | null;
}

// Governorate DTOs
export class CreateGovernorateDto {
  @IsString()
  @IsNotEmpty()
  nameGovernorate: string;

  @IsString()
  @IsNotEmpty()
  countryId: string;
}

export class UpdateGovernorateDto {
  @IsString()
  @IsOptional()
  nameGovernorate?: string;

  @IsString()
  @IsOptional()
  countryId?: string;
}

// Delegation DTOs
export class CreateDelegationDto {
  @IsString()
  @IsNotEmpty()
  nameDelegation: string;

  @IsNumber()
  @Min(1)
  maxConfirmationDelayMinutes: number;

  @IsString()
  @IsNotEmpty()
  governorateId: string;
}

export class UpdateDelegationDto {
  @IsString()
  @IsOptional()
  nameDelegation?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxConfirmationDelayMinutes?: number;

  @IsString()
  @IsOptional()
  governorateId?: string;
}
