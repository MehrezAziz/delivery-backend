import { IsString, IsNumber, IsOptional, Min, Max, MaxLength } from 'class-validator';

export class RegisterDriverStep2Dto {
  @IsString()
  vehicleType: string;

  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  latitude: number;

  @IsNumber()
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  longitude: number;
}
