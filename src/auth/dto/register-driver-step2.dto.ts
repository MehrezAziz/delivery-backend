import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RegisterDriverStep2Dto {
  @IsString()
  pendingToken: string; // Short-lived token from step 1

  @IsString()
  vehicleType: string;

  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  @IsOptional()
  description?: string;

  @IsString()
  delegationId: string; // Required: country/governorate/delegation must be selected

  @IsString()
  @IsOptional()
  street?: string;
}
