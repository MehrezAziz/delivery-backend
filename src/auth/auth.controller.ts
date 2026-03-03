import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  SendOtpDto,
  VerifyOtpDto,
  UserLoginDto,
  UserRegisterDto,
  CompleteUserProfileDto,
  SuperUserLoginDto,
  AuthTokensDto,
  OtpResponseDto,
} from './dto/auth.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { RegisterCustomerResponseDto } from './dto/register-customer-response.dto';
import { Public, CurrentUser, UserId } from './decorators/auth.decorators';
import { JwtUserGuard } from './guards/auth.guards';
import type { AuthenticatedUser } from './dto/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  async userLogin(@Body() dto: UserLoginDto): Promise<AuthTokensDto> {
    return this.authService.userLogin(dto);
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
  async superUserLogin(@Body() dto: SuperUserLoginDto): Promise<AuthTokensDto> {
    return this.authService.superUserLogin(dto);
  }
}
