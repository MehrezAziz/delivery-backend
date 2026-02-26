import { IsString, IsNotEmpty, IsEnum, MinLength, IsPhoneNumber } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @IsPhoneNumber()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  secondName: string;

  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;
}
