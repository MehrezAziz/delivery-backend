import { 
  Controller, 
  Post, 
  Delete, 
  Get, 
  Body, 
  Param, 
  UseGuards 
} from '@nestjs/common';
import { RestrictionService } from './restriction.service';
import type { BlockUserDto, SuspendUserDto, SuspendDriverDto } from './dto/restriction.dto';
import { JwtSuperUserGuard, AdminGuard } from '../auth/guards/auth.guards';
import { CurrentSuperUser } from '../auth/decorators/auth.decorators';
import type { AuthenticatedSuperUser } from '../auth/dto/jwt-payload.interface';

@Controller('admin/restrictions')
@UseGuards(JwtSuperUserGuard, AdminGuard)
export class RestrictionController {
  constructor(private readonly restrictionService: RestrictionService) {}

  @Post('block')
  async blockUser(
    @CurrentSuperUser() admin: AuthenticatedSuperUser,
    @Body() dto: BlockUserDto,
  ) {
    return this.restrictionService.blockUser(dto.userId, dto.reason, admin.id);
  }

  @Post('suspend')
  async suspendUser(
    @CurrentSuperUser() admin: AuthenticatedSuperUser,
    @Body() dto: SuspendUserDto,
  ) {
    return this.restrictionService.suspendUser(
      dto.userId,
      dto.reason,
      dto.durationDays,
      admin.id,
    );
  }

  @Post('suspend-driver')
  async suspendDriver(
    @CurrentSuperUser() admin: AuthenticatedSuperUser,
    @Body() dto: SuspendDriverDto,
  ) {
    return this.restrictionService.suspendDriver(
      dto.driverId,
      dto.reason,
      dto.durationDays,
      admin.id,
    );
  }

  @Delete(':id/lift')
  async liftRestriction(@Param('id') restrictionId: string) {
    await this.restrictionService.liftRestriction(restrictionId);
    return { message: 'Restriction lifted successfully' };
  }

  @Get('user/:userId')
  async getActiveRestrictions(@Param('userId') userId: string) {
    return this.restrictionService.getActiveRestrictions(userId);
  }
}
