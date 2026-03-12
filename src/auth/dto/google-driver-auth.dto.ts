import { IsString } from 'class-validator';

export class GoogleDriverAuthDto {
  @IsString()
  idToken: string;
}
