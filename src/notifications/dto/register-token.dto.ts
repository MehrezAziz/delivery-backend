import { IsString, IsIn, IsOptional } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @IsOptional()
  token: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';
}
