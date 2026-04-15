import { IsOptional, IsInt, Min, Max, IsEnum, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

export class NotificationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsIn(['read', 'unread', 'all'])
  status?: 'read' | 'unread' | 'all' = 'all';

  /** Full inbox: `sentAt` = newest first; `type` = group by type then newest. */
  @IsOptional()
  @IsIn(['sentAt', 'type'])
  sortBy?: 'sentAt' | 'type' = 'sentAt';
}

export class NotificationPreviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 8;
}
