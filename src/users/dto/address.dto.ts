import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateAddressDto {
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsNotEmpty()
  delegationId: string;

  @IsString()
  @IsOptional()
  nickname?: string;
}

export class UpdateAddressDto {
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  delegationId?: string;

  @IsString()
  @IsOptional()
  nickname?: string | null;
}

export class AddressResponseDto {
  id: string;
  latitude: number | null;
  longitude: number | null;
  street: string | null;
  nickname: string | null;
  userId: string | null;
  delegation: {
    id: string;
    nameDelegation: string;
    governorate: {
      id: string;
      nameGovernorate: string;
      country?: {
        id: string;
        name: string;
      };
    };
  };
}
