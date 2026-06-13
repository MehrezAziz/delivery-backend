import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { LocationShareSlot } from '@prisma/client';

export class LookupRecipientQueryDto {
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;
}

export class CreateLocationRequestDto {
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsEnum(LocationShareSlot)
  slot!: LocationShareSlot;

  @IsOptional()
  @IsString()
  clientRequestId?: string;
}

export class AcceptLocationRequestDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsString()
  street?: string;
}
