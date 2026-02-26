import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';
import { RestrictionType } from '@prisma/client';

export class BlockUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class SuspendUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsNumber()
  @IsPositive()
  durationDays: number;
}

export class SuspendDriverDto {
  @IsString()
  @IsNotEmpty()
  driverId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsNumber()
  @IsPositive()
  durationDays: number;
}

export class UserRestrictionResponseDto {
  id: string;
  userId: string;
  type: RestrictionType;
  reason: string;
  imposedBy: string;
  startDate: Date;
  endDate: Date | null;
  liftedAt: Date | null;
  createdAt: Date;
}
