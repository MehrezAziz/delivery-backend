import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { ReferralService } from '../referral/services/referral.service';
import { CodeGeneratorService } from '../referral/services/code-generator.service';
import * as bcrypt from 'bcrypt';
import {
  SendOtpDto,
  VerifyOtpDto,
  UserRegisterDto,
  UserLoginDto,
  CompleteUserProfileDto,
  SuperUserLoginDto,
  AuthTokensDto,
  OtpResponseDto,
} from './dto/auth.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { RegisterCustomerResponseDto } from './dto/register-customer-response.dto';
import { RegisterDriverStep1Dto } from './dto/register-driver-step1.dto';
import { RegisterDriverStep1ResponseDto } from './dto/register-driver-step1-response.dto';
import { DriverLoginDto } from './dto/driver-login.dto';
import {
  UserRole,
  SuperUserRole,
  UserStatus,
  ReferralCode,
  PasswordResetChannel,
} from '@prisma/client';

import { JwtUserPayload, JwtSuperUserPayload } from './dto/jwt-payload.interface';
import {
  ForgotPasswordChannelDto,
  ForgotPasswordEmailPreviewDto,
  ForgotPasswordRequestDto,
  ForgotPasswordResendDto,
  ForgotPasswordVerifyCodeDto,
  ForgotPasswordVerifyFirebaseDto,
  ForgotPasswordResetDto,
} from './dto/forgot-password.dto';
import { MailService } from './mail.service';
import { WhatsappOtpService } from './whatsapp-otp.service';
import { FirebaseService } from '../notifications/services/firebase.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly forgotPwTtlMs = 10 * 60 * 1000;
  private readonly forgotPwResendMs = 5 * 60 * 1000;
  private readonly forgotPwMaxAttempts = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly referralService: ReferralService,
    private readonly codeGeneratorService: CodeGeneratorService,
    private readonly mailService: MailService,
    private readonly whatsappOtpService: WhatsappOtpService,
    private readonly firebaseService: FirebaseService,
  ) {}

  /** Log a login attempt for security audit */
  private async logLoginAttempt(data: {
    identifier: string; loginType: string; success: boolean;
    failReason?: string; ipAddress?: string; userAgent?: string;
  }) {
    try {
      await this.prisma.loginAttempt.create({
        data: {
          identifier: data.identifier,
          loginType: data.loginType,
          success: data.success,
          failReason: data.failReason || null,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
        },
      });
    } catch (e) {
      // Don't let logging failures break the login flow
      console.error('Failed to log login attempt:', e);
    }
  }

  // ============================================
  // USER AUTH (Customer & Driver - Phone OTP)
  // ============================================

  /**
   * Step 1: Send OTP to phone number
   */
  async sendOtp(dto: SendOtpDto): Promise<OtpResponseDto> {
    const { phone, role } = dto;

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    // If user exists, verify role matches
    if (existingUser && existingUser.role !== role) {
      throw new BadRequestException(
        `This phone number is registered as ${existingUser.role}. Please use the correct role.`,
      );
    }

    // Send OTP via OtpService
    const result = await this.otpService.sendOtp(phone, role);

    return {
      message: 'OTP sent successfully',
      expiresInSeconds: result.expiresInSeconds,
      ...(result.otp && { otp: result.otp }), // Only in dev mode
    };
  }

  /**
   * Step 2: Verify OTP and login/register
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthTokensDto> {
    const { phone, role, otp } = dto;

    // Verify OTP
    await this.otpService.verifyOtp(phone, role, otp);

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        customer: true,
        driver: true,
      },
    });

    // If user doesn't exist, create new user + profile
    if (!user) {
      user = await this.createUserWithProfile(phone, role);
    }

    // Check if customer is blocked or driver is suspended
    if (user.customer && user.customer.customerStatus === 'BLOCKED') {
      throw new UnauthorizedException('Your account has been blocked');
    }
    if (user.driver && user.driver.status === 'SUSPENDED') {
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Get profileId
    const profileId = role === UserRole.CUSTOMER ? user.customer!.id : user.driver!.id;

    // Generate JWT tokens
    return this.generateUserTokens(user.id, phone, role, profileId);
  }

  /**
   * Customer registration with optional referral code
   */
  async registerCustomer(dto: RegisterCustomerDto): Promise<RegisterCustomerResponseDto> {
    const { phone, password, firstName, secondName, image, userGender, myEmail, referralCode } = dto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      throw new ConflictException('User with this phone number already exists');
    }

    // Step 1: Validate referral code if provided
    let validatedCode: ReferralCode | null = null;
    if (referralCode) {
      validatedCode = await this.referralService.validateReferralCode(
        referralCode,
        undefined // No customerId yet
      );
    }

    // Step 2: Start transaction
    return await this.prisma.$transaction(async (tx) => {
      // Step 3: Create User with hashed password
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await tx.user.create({
        data: {
          phone,
          password: hashedPassword,
          firstName,
          secondName,
          image,
          userGender,
          myEmail,
          role: UserRole.CUSTOMER,
        },
      });

      // Step 4: Create Customer record with referredByCodeId if code validated
      const customer = await tx.customer.create({
        data: {
          userId: user.id,
          referredByCodeId: validatedCode?.id,
          termsAcceptedAt: new Date(),
        },
      });

      // Step 5: Check for self-referral after customer creation (ownerId === customerId)
      if (validatedCode && validatedCode.ownerId === customer.id) {
        throw new BadRequestException('Cannot use your own referral code');
      }

      // Step 6: Increment referralCode.totalUses if code was used
      if (validatedCode) {
        await tx.referralCode.update({
          where: { id: validatedCode.id },
          data: { totalUses: { increment: 1 } },
        });
      }

      // Step 7: Generate referral code for new customer
      const myReferralCode = await this.codeGeneratorService.generateForCustomer(
        customer.id,
        tx
      );

      // Step 8: Generate JWT token with user id, phone, and role
      const accessToken = this.jwtService.sign({
        sub: user.id,
        phone: user.phone!,
        role: user.role,
        profileId: customer.id,
        type: 'USER',
      } as JwtUserPayload);

      // Step 9: Return RegisterCustomerResponseDto
      return {
        accessToken,
        user: {
          id: user.id,
          phone: user.phone!,
          firstName: user.firstName,
          secondName: user.secondName,
          image: user.image,
          myEmail: user.myEmail,
          userGender: user.userGender,
          role: user.role,
          createdAt: user.createdAt,
        },
        customer: {
          id: customer.id,
          userId: customer.userId,
          completedOrders: customer.completedOrders,
          customerStatus: customer.customerStatus,
          referredByCodeId: customer.referredByCodeId,
        },
        referralCode: {
          id: myReferralCode.id,
          code: myReferralCode.code,
          type: myReferralCode.type,
          value: Number(myReferralCode.value),
          maxDiscountAmount: myReferralCode.maxDiscountAmount
            ? Number(myReferralCode.maxDiscountAmount)
            : undefined,
          minOrderAmount: myReferralCode.minOrderAmount
            ? Number(myReferralCode.minOrderAmount)
            : undefined,
          active: myReferralCode.active,
          validFrom: myReferralCode.validFrom ?? undefined,
          validUntil: myReferralCode.validUntil ?? undefined,
          usageLimit: myReferralCode.usageLimit ?? undefined,
          totalUses: myReferralCode.totalUses,
        },
      };
    });
  }

  /**
   * User registration with phone and password
   */
  async userRegister(dto: UserRegisterDto): Promise<AuthTokensDto> {
    const { phone, password, role, firstName, secondName, myEmail } = dto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      throw new ConflictException('User with this phone number already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with profile
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          phone,
          password: hashedPassword,
          firstName,
          secondName,
          myEmail,
          role,
        },
      });

      // Create associated profile
      if (role === UserRole.CUSTOMER) {
        await tx.customer.create({
          data: {
            userId: newUser.id,
          },
        });
      } else if (role === UserRole.DRIVER) {
        await tx.driver.create({
          data: {
            userId: newUser.id,
            status: 'INCOMPLETE',
          },
        });
      }

      return tx.user.findUnique({
        where: { id: newUser.id },
        include: {
          customer: true,
          driver: true,
        },
      });
    });

    if (!user) {
      throw new Error('Failed to create user');
    }

    // Get profileId
    const profileId = role === UserRole.CUSTOMER ? user.customer!.id : user.driver!.id;

    // Generate JWT tokens
    return this.generateUserTokens(user.id, phone, role, profileId);
  }

  /**
   * User login with phone and password
   */
  async userLogin(dto: UserLoginDto, ipAddress?: string, userAgent?: string): Promise<AuthTokensDto> {
    const { phone, password, role } = dto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        customer: true,
        driver: true,
      },
    });

    if (!user) {
      await this.logLoginAttempt({ identifier: phone, loginType: role, success: false, failReason: 'Account not found', ipAddress, userAgent });
      throw new NotFoundException('Account not found. Please register first.');
    }

    // Check role matches
    if (user.role !== role) {
      await this.logLoginAttempt({ identifier: phone, loginType: role, success: false, failReason: 'Role mismatch', ipAddress, userAgent });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user has password set
    if (!user.password) {
      await this.logLoginAttempt({ identifier: phone, loginType: role, success: false, failReason: 'No password (OTP account)', ipAddress, userAgent });
      throw new BadRequestException(
        'This account uses OTP login. Please use the OTP login method.',
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.logLoginAttempt({ identifier: phone, loginType: role, success: false, failReason: 'Invalid password', ipAddress, userAgent });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if customer is blocked or driver is suspended
    if (user.customer && user.customer.customerStatus === 'BLOCKED') {
      await this.logLoginAttempt({ identifier: phone, loginType: role, success: false, failReason: 'Account blocked', ipAddress, userAgent });
      throw new UnauthorizedException('Your account has been blocked');
    }
    if (user.driver && user.driver.status === 'SUSPENDED') {
      await this.logLoginAttempt({ identifier: phone, loginType: role, success: false, failReason: 'Account suspended', ipAddress, userAgent });
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Get profileId
    const profileId = role === UserRole.CUSTOMER ? user.customer!.id : user.driver!.id;

    await this.logLoginAttempt({ identifier: phone, loginType: role, success: true, ipAddress, userAgent });

    // Generate JWT tokens
    return this.generateUserTokens(user.id, phone, role, profileId);
  }

  /**
   * Complete user profile (optional step after registration)
   */
  async completeProfile(userId: string, dto: CompleteUserProfileDto) {
    const updateData: any = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.secondName !== undefined) updateData.secondName = dto.secondName;
    if (dto.myEmail !== undefined) updateData.myEmail = dto.myEmail;
    if (dto.image !== undefined) updateData.image = dto.image;
    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  /**
   * Verify user's current password (gate for edit profile page)
   */
  async verifyUserPassword(userId: string, password: string): Promise<{ verified: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.password) {
      // Google OAuth users without password — allow access (they authenticated via Google)
      return { verified: true };
    }
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new UnauthorizedException('Invalid password');
    return { verified: true };
  }

  // ============================================
  // SUPER USER AUTH (Admin & CustomerService - Email/Password)
  // ============================================

  /**
   * SuperUser login with email/password
   */
  async superUserLogin(dto: SuperUserLoginDto, ipAddress?: string, userAgent?: string): Promise<AuthTokensDto> {
    const { email, password } = dto;

    // Find superuser
    const superUser = await this.prisma.superUser.findUnique({
      where: { email },
      include: {
        admin: true,
        customerService: true,
      },
    });

    if (!superUser) {
      await this.logLoginAttempt({ identifier: email, loginType: 'SUPERUSER', success: false, failReason: 'Account not found', ipAddress, userAgent });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, superUser.superPassword);
    if (!isPasswordValid) {
      await this.logLoginAttempt({ identifier: email, loginType: superUser.role, success: false, failReason: 'Invalid password', ipAddress, userAgent });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if blocked
    if (superUser.status === UserStatus.BLOCKED) {
      await this.logLoginAttempt({ identifier: email, loginType: superUser.role, success: false, failReason: 'Account blocked', ipAddress, userAgent });
      throw new UnauthorizedException('Your account has been blocked');
    }

    // Get profileId
    const profileId =
      superUser.role === SuperUserRole.ADMIN
        ? superUser.admin!.id
        : superUser.customerService!.id;

    await this.logLoginAttempt({ identifier: email, loginType: superUser.role, success: true, ipAddress, userAgent });

    // Generate JWT tokens
    return this.generateSuperUserTokens(
      superUser.id,
      superUser.email,
      superUser.role,
      profileId,
    );
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Create new user with associated profile (Customer or Driver)
   */
  private async createUserWithProfile(phone: string, role: UserRole) {
    return this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          phone,
          role,
        },
      });

      // Create associated profile
      if (role === UserRole.CUSTOMER) {
        await tx.customer.create({
          data: {
            userId: user.id,
          },
        });
      } else if (role === UserRole.DRIVER) {
        await tx.driver.create({
          data: {
            userId: user.id,
            status: 'INCOMPLETE',
          },
        });
      }

      // Fetch user with relations
      const userWithProfile = await tx.user.findUnique({
        where: { id: user.id },
        include: {
          customer: true,
          driver: true,
        },
      });

      if (!userWithProfile) {
        throw new Error('Failed to create user profile');
      }

      return userWithProfile;
    });
  }

  /**
   * Generate JWT tokens for User (Customer/Driver)
   */
  private generateUserTokens(
    userId: string,
    phone: string,
    role: UserRole,
    profileId: string,
  ): AuthTokensDto {
    const payload: JwtUserPayload = {
      sub: userId,
      phone,
      role,
      profileId,
      type: 'USER',
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '30d',
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
    };
  }

  /**
   * Generate JWT tokens for SuperUser (Admin/CustomerService)
   */
  private generateSuperUserTokens(
    superUserId: string,
    email: string,
    role: SuperUserRole,
    profileId: string,
  ): AuthTokensDto {
    const payload: JwtSuperUserPayload = {
      sub: superUserId,
      email,
      role,
      profileId,
      type: 'SUPER_USER',
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '30d',
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
    };
  }

  /**
   * Verify password (placeholder - implement based on your password storage)
   */
  private async verifyPassword(password: string, email: string): Promise<boolean> {
    // TODO: Implement password verification
    // For now, this is a placeholder
    // You'll need to add a password field to SuperUser model
    // and hash passwords using bcrypt
    
    // Temporary: accept any password in development
    if (this.configService.get('NODE_ENV') === 'development') {
      return true;
    }
    
    return false;
  }

  /**
   * Hash password for SuperUser
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Create SuperUser with hashed password (for admin use)
   */
  async createSuperUser(
    email: string,
    password: string,
    telephone: string,
    pseudo: string,
    role: SuperUserRole,
  ) {
    const hashedPassword = await this.hashPassword(password);
    
    return this.prisma.$transaction(async (tx) => {
      const superUser = await tx.superUser.create({
        data: {
          email,
          superPassword: hashedPassword,
          telephone,
          pseudo,
          role,
          status: UserStatus.ACTIVE,
        },
      });

      // Create associated profile
      if (role === SuperUserRole.ADMIN) {
        await tx.admin.create({
          data: {
            superUserId: superUser.id,
          },
        });
      } else if (role === SuperUserRole.CUSTOMER_SERVICE) {
        await tx.customerService.create({
          data: {
            superUserId: superUser.id,
          },
        });
      }

      return superUser;
    });
  }

  // ============================================
  // GOOGLE OAUTH AUTH
  // ============================================

  /**
   * Google OAuth login/register
   */
  async googleAuth(
    idToken: string,
    role: UserRole,
    referralCode?: string,
    isLoginOnly: boolean = false,
    acceptTerms?: boolean,
  ): Promise<RegisterCustomerResponseDto | AuthTokensDto> {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(this.configService.get('GOOGLE_CLIENT_ID'));

    try {
      // Verify the Google ID token
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      const googleId = payload.sub;
      const googleEmail = payload.email;
      const firstName = payload.given_name;
      const secondName = payload.family_name;
      const image = payload.picture;

      // Check if user exists with this Google ID
      let user = await this.prisma.user.findUnique({
        where: { googleId },
        include: {
          customer: true,
          driver: true,
        },
      });

      // If user doesn't exist, check by email
      if (!user && googleEmail) {
        user = await this.prisma.user.findUnique({
          where: { googleEmail },
          include: {
            customer: true,
            driver: true,
          },
        });
      }

      // If user exists, login
      if (user) {
        // If called from register screen, reject — account already exists
        if (!isLoginOnly) {
          throw new ConflictException('ACCOUNT_EXISTS');
        }

        // Check role matches
        if (user.role !== role) {
          throw new UnauthorizedException(
            `This Google account is registered as ${user.role}. Please use the correct role.`,
          );
        }

        // Check if customer is blocked or driver is suspended
        if (user.customer && user.customer.customerStatus === 'BLOCKED') {
          throw new UnauthorizedException('Your account has been blocked');
        }
        if (user.driver && user.driver.status === 'SUSPENDED') {
          throw new UnauthorizedException('Your account has been suspended');
        }

        // Get profileId
        const profileId = role === UserRole.CUSTOMER ? user.customer!.id : user.driver!.id;

        // Generate JWT tokens
        return this.generateUserTokens(user.id, googleEmail || '', role, profileId);
      }

      // If user doesn't exist and this is login-only, reject
      if (isLoginOnly) {
        throw new NotFoundException('Account not found. Please register first.');
      }

      // If user doesn't exist, register new user
      if (role === UserRole.CUSTOMER) {
        if (acceptTerms !== true) {
          throw new BadRequestException('You must accept the application terms to register');
        }
        return await this.registerCustomerWithGoogle(
          googleId,
          googleEmail,
          firstName,
          secondName,
          image,
          referralCode,
        );
      } else {
        // For drivers, create basic account
        const newUser = await this.prisma.$transaction(async (tx) => {
          const createdUser = await tx.user.create({
            data: {
              googleId,
              googleEmail,
              myEmail: googleEmail, // Set myEmail to the same value as googleEmail
              firstName,
              secondName,
              image,
              phone: null, // Phone is NULL for Google users
              role,
            },
          });

          await tx.driver.create({
            data: {
              userId: createdUser.id,
              status: 'INCOMPLETE',
            },
          });

          return tx.user.findUnique({
            where: { id: createdUser.id },
            include: {
              driver: true,
            },
          });
        });

        if (!newUser) {
          throw new Error('Failed to create user');
        }

        return this.generateUserTokens(newUser.id, googleEmail || '', role, newUser.driver!.id);
      }
    } catch (error: any) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.warn(
        `googleAuth: token verify or DB failed — ${error?.message ?? error}`,
      );
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  /**
   * Google OAuth login only (does not auto-register)
   */
  async googleLogin(idToken: string, role: UserRole): Promise<AuthTokensDto> {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(this.configService.get('GOOGLE_CLIENT_ID'));

    try {
      // Verify the Google ID token
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      const googleId = payload.sub;
      const googleEmail = payload.email;

      // Check if user exists with this Google ID
      let user = await this.prisma.user.findUnique({
        where: { googleId },
        include: {
          customer: true,
          driver: true,
        },
      });

      // If user doesn't exist, check by email
      if (!user && googleEmail) {
        user = await this.prisma.user.findUnique({
          where: { googleEmail },
          include: {
            customer: true,
            driver: true,
          },
        });
      }

      // If user doesn't exist, throw error
      if (!user) {
        throw new NotFoundException('Account not found. Please register first.');
      }

      // Check role matches
      if (user.role !== role) {
        throw new UnauthorizedException(
          `This Google account is registered as ${user.role}. Please use the correct role.`,
        );
      }

      // Check if customer is blocked or driver is suspended
      if (user.customer && user.customer.customerStatus === 'BLOCKED') {
        throw new UnauthorizedException('Your account has been blocked');
      }
      if (user.driver && user.driver.status === 'SUSPENDED') {
        throw new UnauthorizedException('Your account has been suspended');
      }

      // Get profileId
      const profileId = role === UserRole.CUSTOMER ? user.customer!.id : user.driver!.id;

      // Generate JWT tokens
      return this.generateUserTokens(user.id, googleEmail || '', role, profileId);
    } catch (error: any) {
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      }
      this.logger.warn(
        `googleLogin: token verify failed — ${error?.message ?? error}`,
      );
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  /**
   * Register customer with Google OAuth
   */
  private async registerCustomerWithGoogle(
    googleId: string,
    googleEmail: string | undefined,
    firstName: string | undefined,
    secondName: string | undefined,
    image: string | undefined,
    referralCode?: string,
  ): Promise<RegisterCustomerResponseDto> {
    // Step 1: Validate referral code if provided
    let validatedCode: ReferralCode | null = null;
    if (referralCode) {
      validatedCode = await this.referralService.validateReferralCode(
        referralCode,
        undefined,
      );
    }

    // Step 2: Start transaction
    return await this.prisma.$transaction(async (tx) => {
      // Step 3: Create User
      const user = await tx.user.create({
        data: {
          googleId,
          googleEmail,
          myEmail: googleEmail, // Set myEmail to the same value as googleEmail
          firstName,
          secondName,
          image,
          phone: null, // Phone is NULL for Google users
          role: UserRole.CUSTOMER,
        },
      });

      // Step 4: Create Customer record with referredByCodeId if code validated
      const customer = await tx.customer.create({
        data: {
          userId: user.id,
          referredByCodeId: validatedCode?.id,
          termsAcceptedAt: new Date(),
        },
      });

      // Step 5: Check for self-referral
      if (validatedCode && validatedCode.ownerId === customer.id) {
        throw new BadRequestException('Cannot use your own referral code');
      }

      // Step 6: Increment referralCode.totalUses if code was used
      if (validatedCode) {
        await tx.referralCode.update({
          where: { id: validatedCode.id },
          data: { totalUses: { increment: 1 } },
        });
      }

      // Step 7: Generate referral code for new customer
      const myReferralCode = await this.codeGeneratorService.generateForCustomer(
        customer.id,
        tx,
      );

      // Step 8: Generate JWT token
      const accessToken = this.jwtService.sign({
        sub: user.id,
        phone: user.phone!,
        role: user.role,
        profileId: customer.id,
        type: 'USER',
      } as JwtUserPayload);

      // Step 9: Return RegisterCustomerResponseDto
      return {
        accessToken,
        user: {
          id: user.id,
          phone: user.phone!,
          firstName: user.firstName,
          secondName: user.secondName,
          image: user.image,
          myEmail: user.myEmail,
          userGender: user.userGender,
          role: user.role,
          createdAt: user.createdAt,
        },
        customer: {
          id: customer.id,
          userId: customer.userId,
          completedOrders: customer.completedOrders,
          customerStatus: customer.customerStatus,
          referredByCodeId: customer.referredByCodeId,
        },
        referralCode: {
          id: myReferralCode.id,
          code: myReferralCode.code,
          type: myReferralCode.type,
          value: Number(myReferralCode.value),
          maxDiscountAmount: myReferralCode.maxDiscountAmount
            ? Number(myReferralCode.maxDiscountAmount)
            : undefined,
          minOrderAmount: myReferralCode.minOrderAmount
            ? Number(myReferralCode.minOrderAmount)
            : undefined,
          active: myReferralCode.active,
          validFrom: myReferralCode.validFrom ?? undefined,
          validUntil: myReferralCode.validUntil ?? undefined,
          usageLimit: myReferralCode.usageLimit ?? undefined,
          totalUses: myReferralCode.totalUses,
        },
      };
    });
  }

  // ============================================
  // DRIVER REGISTRATION (3-STEP PROCESS)
  // ============================================

  /**
   * Driver Registration Step 1: Validate input, return a short-lived pending token.
   * NO database record is created here — everything is committed atomically in step 2.
   */
  async registerDriverStep1(
    dto: RegisterDriverStep1Dto,
    imageFile?: Express.Multer.File,
  ): Promise<RegisterDriverStep1ResponseDto> {
    const { phone, password, firstName, secondName, myEmail, userGender } = dto;

    // Check phone not already taken
    const existingUser = await this.prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      throw new ConflictException('User with this phone number already exists');
    }

    // Upload profile image if provided (safe to do before DB write)
    let imagePath: string | undefined;
    if (imageFile) {
      const documentsService = new (require('../documents/documents.service').DocumentsService)();
      imagePath = await documentsService.uploadProfileImage(imageFile, phone);
    }

    // Hash password now so we can embed it in the pending token
    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

    // Issue a short-lived pending token (15 min) — no DB write
    const pendingToken = this.jwtService.sign(
      {
        type: 'DRIVER_PENDING',
        phone,
        hashedPassword,
        firstName,
        secondName,
        myEmail,
        userGender,
        image: imagePath,
      },
      { expiresIn: '15m' },
    );

    return {
      pendingToken,
      preview: {
        firstName: firstName ?? undefined,
        secondName: secondName ?? undefined,
        image: imagePath,
        myEmail: myEmail ?? undefined,
        userGender: userGender ?? undefined,
      },
      nextStep: 'step2',
    };
  }

  /**
   * Driver Registration with Google OAuth — Step 1.
   * Verifies the Google token, returns a short-lived pending token. No DB write.
   */
  async registerDriverWithGoogle(
    idToken: string,
  ): Promise<RegisterDriverStep1ResponseDto> {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(this.configService.get('GOOGLE_CLIENT_ID'));

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      const googleId = payload.sub;
      const googleEmail = payload.email;
      const firstName = payload.given_name;
      const secondName = payload.family_name;
      const image = payload.picture;

      // Reject if already registered
      const existing = await this.prisma.user.findFirst({
        where: { OR: [{ googleId }, ...(googleEmail ? [{ googleEmail }] : [])] },
      });
      if (existing) {
        throw new ConflictException('This Google account is already registered');
      }

      // Issue short-lived pending token — no DB write
      const pendingToken = this.jwtService.sign(
        {
          type: 'DRIVER_PENDING',
          googleId,
          googleEmail,
          firstName,
          secondName,
          image,
          myEmail: googleEmail,
        },
        { expiresIn: '15m' },
      );

      return {
        pendingToken,
        preview: {
          firstName: firstName ?? undefined,
          secondName: secondName ?? undefined,
          image: image ?? undefined,
          myEmail: googleEmail ?? undefined,
        },
        nextStep: 'step2',
      };
    } catch (error: any) {
      if (error instanceof ConflictException) throw error;
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  // ============================================
  // DRIVER AUTHENTICATION
  // ============================================

  /**
   * Driver Login with phone and password
   */
  async driverLogin(dto: DriverLoginDto, ipAddress?: string, userAgent?: string): Promise<AuthTokensDto> {
    const { phone, password } = dto;

    // Find user by phone and role=DRIVER
    const user = await this.prisma.user.findFirst({
      where: {
        phone,
        role: UserRole.DRIVER,
      },
      include: {
        driver: true,
      },
    });

    if (!user) {
      await this.logLoginAttempt({ identifier: phone, loginType: 'DRIVER', success: false, failReason: 'Account not found', ipAddress, userAgent });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user has password set
    if (!user.password) {
      await this.logLoginAttempt({ identifier: phone, loginType: 'DRIVER', success: false, failReason: 'No password (Google account)', ipAddress, userAgent });
      throw new BadRequestException(
        'This account uses Google OAuth. Please use Google sign-in.',
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.logLoginAttempt({ identifier: phone, loginType: 'DRIVER', success: false, failReason: 'Invalid password', ipAddress, userAgent });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if driver is suspended
    if (user.driver && user.driver.status === 'SUSPENDED') {
      await this.logLoginAttempt({ identifier: phone, loginType: 'DRIVER', success: false, failReason: 'Account suspended', ipAddress, userAgent });
      throw new UnauthorizedException('Your account has been suspended');
    }

    await this.logLoginAttempt({ identifier: phone, loginType: 'DRIVER', success: true, ipAddress, userAgent });

    // Generate JWT tokens
    return this.generateUserTokens(user.id, phone, UserRole.DRIVER, user.driver!.id);
  }

  /**
   * Driver Google OAuth Login
   */
  async driverGoogleLogin(idToken: string): Promise<AuthTokensDto> {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(this.configService.get('GOOGLE_CLIENT_ID'));

    try {
      // Verify the Google ID token
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      const googleId = payload.sub;
      const googleEmail = payload.email;

      // Find user by googleId and role=DRIVER
      const user = await this.prisma.user.findFirst({
        where: {
          googleId,
          role: UserRole.DRIVER,
        },
        include: {
          driver: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException(
          'This Google account is not registered. Please create an account first.',
        );
      }

      // Check if driver is suspended
      if (user.driver && user.driver.status === 'SUSPENDED') {
        throw new UnauthorizedException('Your account has been suspended');
      }

      // Generate JWT tokens
      return this.generateUserTokens(
        user.id,
        googleEmail || user.phone,
        UserRole.DRIVER,
        user.driver!.id,
      );
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  // ============================================
  // USER FORGOT PASSWORD — CUSTOMER / DRIVER (email / WhatsApp / Firebase SMS)
  // ============================================

  /**
   * Before sending email OTP: check account has a saved email; return masked preview (e.g. aziz*****12@gmail.com).
   */
  async forgotPasswordEmailPreview(
    dto: ForgotPasswordEmailPreviewDto,
  ): Promise<
    | { ok: true; maskedEmail: string }
    | { ok: false; reason: 'NO_ACCOUNT' | 'NO_SAVED_EMAIL' }
  > {
    const role = this.resolveForgotPasswordRole(dto.role);
    const user = await this.findUserWithPasswordForForgot(dto.phone, role);
    if (!user) {
      return { ok: false, reason: 'NO_ACCOUNT' };
    }
    this.assertForgotPasswordUserAllowed(user);
    const em = user.myEmail?.trim();
    if (!em) {
      return { ok: false, reason: 'NO_SAVED_EMAIL' };
    }
    return { ok: true, maskedEmail: this.maskEmailForPreview(em) };
  }

  async forgotPasswordRequest(dto: ForgotPasswordRequestDto): Promise<
    | {
        mode: 'SESSION';
        sessionId: string;
        expiresInSeconds: number;
        resendAfterSeconds: number;
      }
    | { mode: 'FIREBASE_SMS'; phoneE164: string }
  > {
    const role = this.resolveForgotPasswordRole(dto.role);

    if (dto.channel === ForgotPasswordChannelDto.SMS) {
      if (!dto.phone) {
        throw new BadRequestException('Phone is required');
      }
      const user = await this.findUserWithPasswordForForgot(dto.phone, role);
      if (!user) {
        throw new NotFoundException(
          'No account with this phone number and a saved password.',
        );
      }
      this.assertForgotPasswordUserAllowed(user);
      if (!this.firebaseService.isInitialized) {
        throw new BadRequestException(
          'SMS recovery is not configured (Firebase Admin missing).',
        );
      }
      return { mode: 'FIREBASE_SMS', phoneE164: dto.phone };
    }

    if (dto.channel === ForgotPasswordChannelDto.EMAIL) {
      const user = await this.findUserWithPasswordForForgot(dto.phone, role);
      if (!user) {
        throw new NotFoundException(
          'No account with this phone number and a saved password.',
        );
      }
      this.assertForgotPasswordUserAllowed(user);
      const dest = user.myEmail?.trim();
      if (!dest) {
        throw new BadRequestException(
          'No email saved on this account. Use phone recovery or sign in to add an email first.',
        );
      }
      await this.prisma.passwordResetSession.deleteMany({
        where: { userId: user.id },
      });
      const code = this.generateSixDigitCode();
      const codeHash = await bcrypt.hash(code, 10);
      await this.mailService.sendPasswordResetCode(dest, code);
      const session = await this.prisma.passwordResetSession.create({
        data: {
          userId: user.id,
          channel: PasswordResetChannel.EMAIL,
          codeHash,
          expiresAt: new Date(Date.now() + this.forgotPwTtlMs),
          attempts: 0,
          lastSentAt: new Date(),
        },
      });
      return {
        mode: 'SESSION',
        sessionId: session.id,
        expiresInSeconds: Math.floor(this.forgotPwTtlMs / 1000),
        resendAfterSeconds: Math.floor(this.forgotPwResendMs / 1000),
      };
    }

    if (!dto.phone) {
      throw new BadRequestException('Phone is required');
    }
    const waUser = await this.findUserWithPasswordForForgot(dto.phone, role);
    if (!waUser) {
      throw new NotFoundException(
        'No account with this phone number and a saved password.',
      );
    }
    this.assertForgotPasswordUserAllowed(waUser);
    await this.prisma.passwordResetSession.deleteMany({
      where: { userId: waUser.id },
    });
    const code = this.generateSixDigitCode();
    const codeHash = await bcrypt.hash(code, 10);
    const session = await this.prisma.passwordResetSession.create({
      data: {
        userId: waUser.id,
        channel: PasswordResetChannel.WHATSAPP,
        codeHash,
        expiresAt: new Date(Date.now() + this.forgotPwTtlMs),
        attempts: 0,
        lastSentAt: new Date(),
      },
    });
    const waDigits = dto.phone.replace(/\D/g, '');
    await this.whatsappOtpService.sendVerificationCode(waDigits, code);
    return {
      mode: 'SESSION',
      sessionId: session.id,
      expiresInSeconds: Math.floor(this.forgotPwTtlMs / 1000),
      resendAfterSeconds: Math.floor(this.forgotPwResendMs / 1000),
    };
  }

  async forgotPasswordResend(dto: ForgotPasswordResendDto): Promise<{
    expiresInSeconds: number;
    resendAfterSeconds: number;
  }> {
    const session = await this.prisma.passwordResetSession.findUnique({
      where: { id: dto.sessionId },
      include: { user: true },
    });
    if (!session) {
      throw new NotFoundException('Session expired. Start again.');
    }
    const now = Date.now();
    const codeExpired = session.expiresAt.getTime() < now;
    const sinceLast = now - session.lastSentAt.getTime();
    if (!codeExpired && sinceLast < this.forgotPwResendMs) {
      const waitSec = Math.ceil((this.forgotPwResendMs - sinceLast) / 1000);
      throw new BadRequestException(
        `Please wait ${waitSec}s before resending.`,
      );
    }
    const code = this.generateSixDigitCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.forgotPwTtlMs);
    const lastSentAt = new Date();
    if (session.channel === PasswordResetChannel.EMAIL) {
      const email = session.user.myEmail;
      if (!email) throw new BadRequestException('User email missing');
      await this.mailService.sendPasswordResetCode(email, code);
    } else {
      const phone = session.user.phone;
      if (!phone) throw new BadRequestException('User phone missing');
      await this.whatsappOtpService.sendVerificationCode(
        phone.replace(/\D/g, ''),
        code,
      );
    }
    await this.prisma.passwordResetSession.update({
      where: { id: session.id },
      data: {
        codeHash,
        expiresAt,
        attempts: 0,
        lastSentAt,
      },
    });
    return {
      expiresInSeconds: Math.floor(this.forgotPwTtlMs / 1000),
      resendAfterSeconds: Math.floor(this.forgotPwResendMs / 1000),
    };
  }

  async forgotPasswordVerifyCode(
    dto: ForgotPasswordVerifyCodeDto,
  ): Promise<{ resetToken: string }> {
    const session = await this.prisma.passwordResetSession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      if (session) {
        await this.prisma.passwordResetSession.delete({ where: { id: session.id } });
      }
      throw new BadRequestException('Code expired. Request a new one.');
    }

    if (session.attempts >= this.forgotPwMaxAttempts) {
      await this.prisma.passwordResetSession.delete({ where: { id: session.id } });
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Maximum verification attempts reached. Request a new code.',
          attempts: session.attempts,
          maxAttempts: this.forgotPwMaxAttempts,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const nextAttempts = session.attempts + 1;

    const ok = await bcrypt.compare(dto.code, session.codeHash);
    if (!ok) {
      await this.prisma.passwordResetSession.update({
        where: { id: session.id },
        data: { attempts: nextAttempts },
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid code',
          attempts: nextAttempts,
          maxAttempts: this.forgotPwMaxAttempts,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.passwordResetSession.delete({ where: { id: session.id } });
    const resetToken = this.issuePasswordResetToken(session.userId);
    return { resetToken };
  }

  async forgotPasswordVerifyFirebase(
    dto: ForgotPasswordVerifyFirebaseDto,
  ): Promise<{ resetToken: string }> {
    if (!this.firebaseService.isInitialized) {
      throw new BadRequestException('Firebase Auth is not configured.');
    }
    const role = this.resolveForgotPasswordRole(dto.role);
    let decoded: { phone_number?: string };
    try {
      decoded = await this.firebaseService.verifyIdToken(dto.idToken);
    } catch {
      throw new UnauthorizedException('Invalid Firebase token');
    }
    const phone = decoded.phone_number;
    if (!phone) {
      throw new BadRequestException('Phone number missing from token');
    }
    const user = await this.findUserWithPasswordForForgot(phone, role);
    if (!user) {
      throw new NotFoundException(
        'No account with this phone number and a saved password.',
      );
    }
    this.assertForgotPasswordUserAllowed(user);
    const resetToken = this.issuePasswordResetToken(user.id);
    return { resetToken };
  }

  async forgotPasswordReset(dto: ForgotPasswordResetDto): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    let userId: string;
    try {
      const payload = this.jwtService.verify<{ sub: string; type?: string }>(
        dto.resetToken,
      );
      if (payload.type !== 'PASSWORD_RESET') {
        throw new UnauthorizedException('Invalid reset token');
      }
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true, driver: true },
    });
    if (!user || (user.role !== UserRole.CUSTOMER && user.role !== UserRole.DRIVER)) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.CUSTOMER) {
      if (!user.customer || user.customer.customerStatus === 'BLOCKED') {
        throw new UnauthorizedException('Your account has been blocked');
      }
    }
    if (user.role === UserRole.DRIVER) {
      if (!user.driver || user.driver.status === 'SUSPENDED') {
        throw new UnauthorizedException('Your account has been suspended');
      }
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return { message: 'Password updated successfully' };
  }

  private issuePasswordResetToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, type: 'PASSWORD_RESET' },
      { expiresIn: '15m' },
    );
  }

  private generateSixDigitCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private resolveForgotPasswordRole(role?: UserRole): UserRole {
    const r = role ?? UserRole.CUSTOMER;
    if (r !== UserRole.CUSTOMER && r !== UserRole.DRIVER) {
      throw new BadRequestException('Password recovery supports CUSTOMER or DRIVER only.');
    }
    return r;
  }

  private async findUserWithPasswordForForgot(phone: string, role: UserRole) {
    return this.prisma.user.findFirst({
      where: {
        phone,
        role,
        password: { not: null },
      },
      include: { customer: true, driver: true },
    });
  }

  private assertForgotPasswordUserAllowed(
    user: {
      role: UserRole;
      customer: { customerStatus: string } | null;
      driver: { status: string } | null;
    },
  ): void {
    if (user.role === UserRole.CUSTOMER && user.customer?.customerStatus === 'BLOCKED') {
      throw new UnauthorizedException('Your account has been blocked');
    }
    if (user.role === UserRole.DRIVER && user.driver?.status === 'SUSPENDED') {
      throw new UnauthorizedException('Your account has been suspended');
    }
  }

  /** e.g. azizmehrez12@gmail.com → aziz*****12@gmail.com */
  private maskEmailForPreview(email: string): string {
    const trimmed = email.trim();
    const at = trimmed.indexOf('@');
    if (at <= 0) return '***@***';
    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1);
    if (!domain) return '***@***';
    if (local.length <= 2) {
      return `***@${domain}`;
    }
    if (local.length <= 5) {
      return `${local[0]}***${local.slice(-1)}@${domain}`;
    }
    return `${local.slice(0, 4)}*****${local.slice(-2)}@${domain}`;
  }
}
