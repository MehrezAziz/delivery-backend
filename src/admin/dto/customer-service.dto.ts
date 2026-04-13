import { IsString, IsNotEmpty, IsEmail, IsArray, IsEnum, IsOptional, MinLength, ArrayMinSize } from 'class-validator';
import { CustomerServiceRole } from '@prisma/client';

export class CreateCustomerServiceDto {
  @IsString()
  @IsNotEmpty()
  telephone: string;

  @IsString()
  @IsNotEmpty()
  pseudo: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsArray()
  @IsEnum(CustomerServiceRole, { each: true })
  @IsOptional()
  roles?: CustomerServiceRole[];
}

export class UpdateCustomerServiceDto {
  @IsString()
  @IsOptional()
  telephone?: string;

  @IsString()
  @IsOptional()
  pseudo?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}

export class UpdateCustomerServiceRolesDto {
  @IsArray()
  @IsEnum(CustomerServiceRole, { each: true })
  @IsNotEmpty()
  roles: CustomerServiceRole[];
}

export class SetCustomerServiceGovernoratesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(0)
  governorateIds!: string[];
}

export class CustomerServiceResponseDto {
  id: string;
  superUserId: string;
  roles: CustomerServiceRole[];
  governorates?: {
    id: string;
    governorateId: string;
    nameGovernorate: string;
    countryId: string;
    countryName?: string;
  }[];
  superUser: {
    id: string;
    telephone: string;
    pseudo: string;
    email: string;
    role: string;
    status: string;
    createdAt: Date;
  };
}

export class CustomerServiceListDto {
  id: string;
  superUserId: string;
  roles: CustomerServiceRole[];
  telephone: string;
  pseudo: string;
  email: string;
  status: string;
}
