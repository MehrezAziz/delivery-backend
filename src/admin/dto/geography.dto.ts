import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsNumber, Min } from 'class-validator';

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
