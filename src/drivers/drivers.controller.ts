import { 
  BadRequestException,
  Controller, 
  Get, 
  Post,
  Put,
  Patch,
  Body, 
  Param, 
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  UseGuards 
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { VerificationService } from './services/verification.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { AvailabilityService } from './services/availability.service';
import type { WeeklyAvailabilityDto } from './services/availability.service';
import type { UploadDocumentsDto, RejectDriverDto, SuspendDriverDto } from './dto/driver-verification.dto';
import {
  CreateLivenessChallengeDto,
  VerifyDocumentSubmissionDto,
} from './dto/verification-analysis.dto';
import { CurrentUser, UserId } from '../auth/decorators/auth.decorators';
import {
  JwtUserGuard,
  JwtSuperUserGuard,
  DriverGuard,
  AdminGuard,
  StaffGuard,
} from '../auth/guards/auth.guards';
import type { AuthenticatedUser, AuthenticatedSuperUser } from '../auth/dto/jwt-payload.interface';
import { IdentityVerificationService } from './services/identity-verification.service';
import { MlVerificationService } from './services/ml-verification.service';
import { CreateDriverWithdrawalDto } from './dto/driver-withdrawal.dto';

@Controller('drivers')
@UseGuards(JwtUserGuard, DriverGuard)
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly verificationService: VerificationService,
    private readonly availabilityService: AvailabilityService,
    private readonly identityVerificationService: IdentityVerificationService,
    private readonly mlVerificationService: MlVerificationService,
  ) {}

  /**
   * GET /drivers/me
   * Get authenticated driver profile
   */
  @Get('me')
  async getMyProfile(@UserId() userId: string) {
    return this.driversService.getDriverProfile(userId);
  }

  /**
   * PATCH /drivers/me
   * Update driver profile (phone, vehicleType, description, gender)
   */
  @Patch('me')
  async updateMyProfile(@UserId() userId: string, @Body() body: {
    phone?: string; vehicleType?: string; description?: string; userGender?: string;
  }) {
    return this.driversService.updateDriverProfile(userId, body);
  }

  /**
   * GET /drivers/me/geography
   * Get driver's addresses with full delegation/governorate/country info
   */
  @Get('me/geography')
  async getMyGeography(@CurrentUser() user: AuthenticatedUser) {
    return this.driversService.getDriverGeography(user.profileId);
  }

  /**
   * GET /drivers/me/ratings
   * Get driver's received ratings
   */
  @Get('me/ratings')
  async getMyRatings(@CurrentUser() user: AuthenticatedUser) {
    return this.driversService.getDriverRatings(user.profileId);
  }

  /**
   * GET /drivers/me/transactions
   * Get driver transaction history
   */
  @Get('me/transactions')
  async getMyTransactions(
    @UserId() userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.driversService.getDriverTransactions(userId, page, limit);
  }

  /**
   * GET /drivers/me/earnings?channel=all|wallet|cash&preset=today|week|month|all_time&from=&to=
   */
  @Get('me/earnings')
  async getMyEarnings(
    @UserId() userId: string,
    @Query('channel') channel?: string,
    @Query('preset') preset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.driversService.getDriverEarnings(userId, { channel, preset, from, to });
  }

  @Get('me/withdrawal-requests')
  async getMyWithdrawalRequests(@UserId() userId: string) {
    return this.driversService.getDriverWithdrawalRequests(userId);
  }

  @Get('me/payout-bank-details')
  async getMyPayoutBankDetails(@UserId() userId: string) {
    return this.driversService.getPayoutBankDetails(userId);
  }

  @Post('me/withdrawal-requests')
  async createMyWithdrawalRequest(@UserId() userId: string, @Body() dto: CreateDriverWithdrawalDto) {
    return this.driversService.createDriverWithdrawalRequest(userId, dto);
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
   * POST /drivers/verification/:documentId/liveness/challenge
   * Creates a short-lived liveness challenge sequence for realtime selfie checks.
   */
  @Post('verification/:documentId/liveness/challenge')
  async createLivenessChallenge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Body() dto: CreateLivenessChallengeDto,
  ) {
    return this.identityVerificationService.createLivenessChallenge(user.id, documentId, dto);
  }

  /**
   * POST /drivers/verification/:documentId/analyze
   * Stores OCR/face/liveness outputs and applies rule-based verification decision.
   */
  @Post('verification/:documentId/analyze')
  async analyzeVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Query('challengeId') challengeId: string,
    @Body() dto: VerifyDocumentSubmissionDto,
  ) {
    return this.identityVerificationService.verifySubmission(
      user.id,
      documentId,
      challengeId,
      dto,
    );
  }

  /**
   * POST /drivers/verification/liveness/frame-check
   * Realtime pose/blink check powered by ML worker.
   */
  @Post('verification/liveness/frame-check')
  async checkLivenessFrame(
    @Body()
    body: {
      action?: 'TURN_LEFT' | 'TURN_RIGHT' | 'HOLD_HIGH' | 'BLINK';
      imageBase64?: string;
    },
  ) {
    const action = body?.action;
    const imageBase64 = body?.imageBase64;
    if (!action || !imageBase64) {
      throw new BadRequestException('action and imageBase64 are required');
    }
    return this.mlVerificationService.checkLivenessFrame(action, imageBase64);
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

@Controller('staff/drivers')
@UseGuards(JwtSuperUserGuard, StaffGuard)
export class StaffDriverController {
  constructor(private readonly adminApprovalService: AdminApprovalService) {}

  /**
   * GET /staff/drivers/:id/verification-history
   * Admin can always access. Customer service requires VERIFY_ACCOUNTS permission.
   */
  @Get(':id/verification-history')
  async getDriverVerificationHistory(
    @CurrentUser() staff: AuthenticatedSuperUser,
    @Param('id') driverId: string,
  ) {
    return this.adminApprovalService.getDriverVerificationHistoryForStaff(staff, driverId);
  }
}
