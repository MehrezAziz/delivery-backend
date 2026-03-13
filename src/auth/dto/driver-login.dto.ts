import { IsString, MinLength, Matches } from 'class-validator';

export class DriverLoginDto {
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone must be in E.164 format (e.g., +1234567890)',
  })
  phone: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}
