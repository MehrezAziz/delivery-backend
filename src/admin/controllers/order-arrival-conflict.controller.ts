import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { JwtSuperUserGuard, StaffGuard } from '../../auth/guards/auth.guards';
import { CurrentSuperUser } from '../../auth/decorators/auth.decorators';
import type { AuthenticatedSuperUser } from '../../auth/dto/jwt-payload.interface';
import { OrderArrivalConflictService } from '../services/order-arrival-conflict.service';

class ResolveArrivalConflictDto {
  @IsEnum(['FORGIVE', 'SUSPEND_CUSTOMER', 'SUSPEND_DRIVER'] as const)
  action!: 'FORGIVE' | 'SUSPEND_CUSTOMER' | 'SUSPEND_DRIVER';

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('admin/order-arrival-conflicts')
@UseGuards(JwtSuperUserGuard, StaffGuard)
export class OrderArrivalConflictController {
  constructor(private readonly conflictService: OrderArrivalConflictService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.conflictService.list(status);
  }

  @Patch(':id/resolve')
  resolve(
    @CurrentSuperUser() staff: AuthenticatedSuperUser,
    @Param('id') id: string,
    @Body() dto: ResolveArrivalConflictDto,
  ) {
    return this.conflictService.resolve(id, staff.id, dto.action, dto.note);
  }
}
