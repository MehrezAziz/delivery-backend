import { 
  Controller, 
  Get, 
  Post,
  Put,
  Body, 
  Param, 
  UseGuards 
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { VerificationService } from './services/verification.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { AvailabilityService } from './services/availability.service';
import type { WeeklyAvailabilityDto } from './services/availability.service';
import type { UploadDocumentsDto, RejectDriverDto, SuspendDriverDto } from './dto/driver-verification.dto';
import { CurrentUser, UserId } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, JwtSuperUserGuard, DriverGuard, AdminGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('drivers')
@UseGuards(JwtUserGuard, DriverGuard)
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly verificationService: VerificationService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * GET /drivers/me
   * Get authenticated driver profile
   */
  @Get('me')
  async getMyProfile(@UserId() userId: string) {
    return this.driversService.getDriverProfile(userId);
  }

  @Post('documents')
  async uploadDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDocumentsDto,
  ) {
    return this.verificationService.uploadDocuments(user.id, dto);
  }

  @Get('verification')
  async getVerificationStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.getVerificationStatus(user.id);
  }

  /**
   * GET /drivers/availability
   * Get driver's weekly availability schedule
   */
  @Get('availability')
  async getAvailability(@CurrentUser() user: AuthenticatedUser) {
    return this.availabilityService.getDriverAvailability(user.profileId);
  }

  /**
   * PUT /drivers/availability
   * Update driver's weekly availability schedule
   */
  @Put('availability')
  async updateAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WeeklyAvailabilityDto,
  ) {
    return this.availabilityService.updateDriverAvailability(user.profileId, dto);
  }

  /**
   * POST /drivers/availability/toggle
   * Toggle availability status (ACTIVE/INACTIVE)
   */
  @Post('availability/toggle')
  async toggleAvailability(@CurrentUser() user: AuthenticatedUser) {
    return this.availabilityService.toggleAvailabilityStatus(user.profileId);
  }
}

@Controller('admin/drivers')
@UseGuards(JwtSuperUserGuard, AdminGuard)
export class AdminDriverController {
  constructor(private readonly adminApprovalService: AdminApprovalService) {}

  @Get('pending')
  async getPendingDrivers() {
    return this.adminApprovalService.getPendingDrivers();
  }

  @Post(':id/approve')
  async approveDriver(@Param('id') driverId: string) {
    return this.adminApprovalService.approveDriver(driverId);
  }

  @Post(':id/reject')
  async rejectDriver(
    @Param('id') driverId: string,
    @Body() dto: RejectDriverDto,
  ) {
    return this.adminApprovalService.rejectDriver(driverId, dto.reason);
  }

  @Post(':id/suspend')
  async suspendDriver(
    @Param('id') driverId: string,
    @Body() dto: SuspendDriverDto,
  ) {
    return this.adminApprovalService.suspendDriver(driverId, dto.reason);
  }
}
