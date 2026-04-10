import { IsString } from 'class-validator';

export class RegisterLivenessCheckpointDto {
  @IsString()
  livenessSession: string;
}
