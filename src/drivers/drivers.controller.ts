import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards 
} from '@nestjs/common';
import { VerificationService } from './services/verification.service';
import { AdminApprovalService } from './services/admin-approval.service';
import type { UploadDocumentsDto, RejectDriverDto, SuspendDriverDto } from './dto/driver-verification.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, JwtSuperUserGuard, DriverGuard, AdminGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('driver')
@UseGuards(JwtUserGuard, DriverGuard)
export class DriversController {
  constructor(private readonly verificationService: VerificationService) {}

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
