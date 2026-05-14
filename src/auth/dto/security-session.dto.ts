import { IsString, MinLength } from 'class-validator';

export class EstablishSecuritySessionPasswordDto {
  @IsString()
  @MinLength(1)
  password!: string;
}
