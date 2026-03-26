import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Patch,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { DriversService } from '../drivers/drivers.service';
import {
  SendOtpDto,
  VerifyOtpDto,
  UserLoginDto,
  UserRegisterDto,
  CompleteUserProfileDto,
  SuperUserLoginDto,
  GoogleAuthDto,
  AuthTokensDto,
  OtpResponseDto,
} from './dto/auth.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { RegisterCustomerResponseDto } from './dto/register-customer-response.dto';
import { RegisterDriverStep1Dto } from './dto/register-driver-step1.dto';
import { RegisterDriverStep2Dto } from './dto/register-driver-step2.dto';
import { RegisterDriverStep3Dto } from './dto/register-driver-step3.dto';
import { DriverLoginDto } from './dto/driver-login.dto';
import { GoogleDriverAuthDto } from './dto/google-driver-auth.dto';
import { Public, CurrentUser, UserId } from './decorators/auth.decorators';
import { JwtUserGuard } from './guards/auth.guards';
import type { AuthenticatedUser } from './dto/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly driversService: DriversService,
  ) {}

  // ============================================
  // USER AUTH ENDPOINTS (Customer & Driver)
  // ============================================

  /**
   * POST /auth/user/send-otp
   * Send OTP to phone number
   */
  @Public()
  @Post('user/send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto): Promise<OtpResponseDto> {
    return this.authService.sendOtp(dto);
  }

  /**
   * POST /auth/user/verify-otp
   * Verify OTP and login/register
   */
  @Public()
  @Post('user/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthTokensDto> {
    return this.authService.verifyOtp(dto);
  }

  /**
   * POST /auth/user/register
   * Register new user with phone and password
   */
  @Public()
  @Post('user/register')
  @HttpCode(HttpStatus.CREATED)
  async userRegister(@Body() dto: UserRegisterDto): Promise<AuthTokensDto> {
    return this.authService.userRegister(dto);
  }

  /**
   * POST /auth/customer/register
   * Register new customer with optional referral code
   */
  @Public()
  @Post('customer/register')
  @HttpCode(HttpStatus.CREATED)
  async registerCustomer(@Body() dto: RegisterCustomerDto): Promise<RegisterCustomerResponseDto> {
    return this.authService.registerCustomer(dto);
  }

  /**
   * POST /auth/user/login
   * Login with phone and password
   */
  @Public()
  @Post('user/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  async userLogin(@Body() dto: UserLoginDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.userLogin(dto, req.ip, req.headers['user-agent']);
  }

  /**
   * PATCH /auth/user/complete-profile
   * Complete user profile (authenticated)
   */
  @UseGuards(JwtUserGuard)
  @Patch('user/complete-profile')
  async completeProfile(
    @UserId() userId: string,
    @Body() dto: CompleteUserProfileDto,
  ) {
    return this.authService.completeProfile(userId, dto);
  }

  /**
   * POST /auth/verify-password
   * Verify current user's password (gate for edit profile)
   */
  @UseGuards(JwtUserGuard)
  @Post('verify-password')
  @HttpCode(HttpStatus.OK)
  async verifyCurrentPassword(
    @UserId() userId: string,
    @Body() body: { password: string },
  ) {
    return this.authService.verifyUserPassword(userId, body.password);
  }

  /**
   * GET /auth/user/me
   * Get current user info
   */
  @UseGuards(JwtUserGuard)
  @Post('user/me')
  @HttpCode(HttpStatus.OK)
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      phone: user.phone,
      role: user.role,
      profileId: user.profileId,
    };
  }

  /**
   * POST /auth/google
   * Google OAuth register (creates new account if doesn't exist)
   */
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(@Body() dto: GoogleAuthDto): Promise<RegisterCustomerResponseDto | AuthTokensDto> {
    return this.authService.googleAuth(dto.idToken, dto.role, dto.referralCode, dto.isLoginOnly ?? false);
  }

  /**
   * POST /auth/google/login
   * Google OAuth login only (does not auto-register)
   */
  @Public()
  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  async googleLogin(@Body() dto: GoogleAuthDto): Promise<AuthTokensDto> {
    return this.authService.googleLogin(dto.idToken, dto.role);
  }

  // ============================================
  // DRIVER REGISTRATION ENDPOINTS (3-STEP PROCESS)
  // ============================================

  /**
   * POST /auth/driver/register/step1
   * Driver registration step 1: User information with optional profile picture
   */
  @Public()
  @Post('driver/register/step1')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image'))
  async registerDriverStep1(
    @Body() dto: RegisterDriverStep1Dto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.authService.registerDriverStep1(dto, image);
  }

  /**
   * POST /auth/driver/google
   * Driver registration with Google OAuth
   */
  @Public()
  @Post('driver/google')
  @HttpCode(HttpStatus.CREATED)
  async registerDriverWithGoogle(@Body() dto: GoogleDriverAuthDto) {
    return this.authService.registerDriverWithGoogle(dto.idToken);
  }

  /**
   * POST /auth/driver/register/step2
   * Driver registration step 2: Commits user+driver+address atomically using the pending token.
   */
  @Public()
  @Post('driver/register/step2')
  @HttpCode(HttpStatus.CREATED)
  async registerDriverStep2(
    @Body() dto: RegisterDriverStep2Dto,
    @Body('pendingToken') pendingToken: string,
  ) {
    return this.driversService.completeDriverProfile(pendingToken, dto);
  }

  /**
   * POST /auth/driver/register/step3
   * Driver registration step 3: Document verification
   */
  @UseGuards(JwtUserGuard)
  @Post('driver/register/step3')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'selfieImage', maxCount: 1 },
      { name: 'docImageTop', maxCount: 1 },
      { name: 'docImageBottom', maxCount: 1 },
    ]),
  )
  async registerDriverStep3(
    @UserId() userId: string,
    @Body() dto: RegisterDriverStep3Dto,
    @UploadedFiles()
    files: {
      selfieImage?: Express.Multer.File[];
      docImageTop?: Express.Multer.File[];
      docImageBottom?: Express.Multer.File[];
    },
  ) {
    const documentFiles = {
      selfieImage: files.selfieImage?.[0]!,
      docImageTop: files.docImageTop?.[0]!,
      docImageBottom: files.docImageBottom?.[0],
    };

    return this.driversService.submitDocumentVerification(userId, dto, documentFiles);
  }

  // ============================================
  // DRIVER AUTHENTICATION ENDPOINTS
  // ============================================

  /**
   * POST /auth/driver/login
   * Driver login with phone and password
   */
  @Public()
  @Post('driver/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async driverLogin(@Body() dto: DriverLoginDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.driverLogin(dto, req.ip, req.headers['user-agent']);
  }

  /**
   * POST /auth/driver/google/login
   * Driver login with Google OAuth
   */
  @Public()
  @Post('driver/google/login')
  @HttpCode(HttpStatus.OK)
  async driverGoogleLogin(@Body() dto: GoogleDriverAuthDto): Promise<AuthTokensDto> {
    return this.authService.driverGoogleLogin(dto.idToken);
  }

  // ============================================
  // SUPER USER AUTH ENDPOINTS (Admin & CustomerService)
  // ============================================

  /**
   * POST /auth/superuser/login
   * SuperUser login with email/password
   */
  @Public()
  @Post('superuser/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async superUserLogin(@Body() dto: SuperUserLoginDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.superUserLogin(dto, req.ip, req.headers['user-agent']);
  }
}
