import { IsString, IsIn, IsNotEmpty } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';
}
