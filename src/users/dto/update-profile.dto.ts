import { IsString, IsOptional, IsEmail } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  secondName?: string;

  @IsString()
  @IsOptional()
  photo?: string;

  @IsEmail()
  @IsOptional()
  myEmail?: string;

  @IsString()
  @IsOptional()
  image?: string;
}
