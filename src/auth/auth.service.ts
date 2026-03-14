import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
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
import { UserRole, SuperUserRole, UserStatus, ReferralCode } from '@prisma/client';
import { JwtUserPayload, JwtSuperUserPayload } from './dto/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly referralService: ReferralService,
    private readonly codeGeneratorService: CodeGeneratorService,
  ) {}

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
  async userLogin(dto: UserLoginDto): Promise<AuthTokensDto> {
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
      throw new NotFoundException('Account not found. Please register first.');
    }

    // Check role matches
    if (user.role !== role) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user has password set
    if (!user.password) {
      throw new BadRequestException(
        'This account uses OTP login. Please use the OTP login method.',
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
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
   * Complete user profile (optional step after registration)
   */
  async completeProfile(userId: string, dto: CompleteUserProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        secondName: dto.secondName,
        myEmail: dto.myEmail,
        image: dto.image,
      },
    });
  }

  // ============================================
  // SUPER USER AUTH (Admin & CustomerService - Email/Password)
  // ============================================

  /**
   * SuperUser login with email/password
   */
  async superUserLogin(dto: SuperUserLoginDto): Promise<AuthTokensDto> {
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
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, superUser.superPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if blocked
    if (superUser.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Your account has been blocked');
    }

    // Get profileId
    const profileId =
      superUser.role === SuperUserRole.ADMIN
        ? superUser.admin!.id
        : superUser.customerService!.id;

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
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
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
      expiresIn: 7 * 24 * 60 * 60,
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
  async googleAuth(idToken: string, role: UserRole, referralCode?: string, isLoginOnly: boolean = false): Promise<RegisterCustomerResponseDto | AuthTokensDto> {
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
        // For customers, use the full registration flow with referral code support
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
        error instanceof NotFoundException
      ) {
        throw error;
      }
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
   * Driver Registration Step 1: User Information
   */
  async registerDriverStep1(
    dto: RegisterDriverStep1Dto,
    imageFile?: Express.Multer.File,
  ): Promise<RegisterDriverStep1ResponseDto> {
    const { phone, password, firstName, secondName, myEmail, userGender } = dto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      throw new ConflictException('User with this phone number already exists');
    }

    // Upload profile image if provided
    let imagePath: string | undefined;
    if (imageFile) {
      const documentsService = new (require('../documents/documents.service').DocumentsService)();
      imagePath = await documentsService.uploadProfileImage(imageFile, phone);
    }

    // Start transaction
    return await this.prisma.$transaction(async (tx) => {
      // Hash password if provided
      const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

      // Create User with role=DRIVER
      const user = await tx.user.create({
        data: {
          phone,
          password: hashedPassword,
          firstName,
          secondName,
          myEmail,
          userGender,
          image: imagePath,
          role: UserRole.DRIVER,
        },
      });

      // Create Driver with status=INCOMPLETE
      const driver = await tx.driver.create({
        data: {
          userId: user.id,
          status: 'INCOMPLETE',
        },
      });

      // Generate JWT token
      const accessToken = this.jwtService.sign({
        sub: user.id,
        phone: user.phone,
        role: user.role,
        profileId: driver.id,
        type: 'USER',
      } as JwtUserPayload);

      // Return response
      return {
        accessToken,
        user: {
          id: user.id,
          phone: user.phone!,
          firstName: user.firstName ?? undefined,
          secondName: user.secondName ?? undefined,
          image: user.image ?? undefined,
          myEmail: user.myEmail ?? undefined,
          userGender: user.userGender ?? undefined,
          role: 'DRIVER',
          createdAt: user.createdAt,
        },
        driver: {
          id: driver.id,
          userId: driver.userId,
          status: 'INCOMPLETE',
        },
        nextStep: 'step2',
      };
    });
  }

  /**
   * Driver Registration with Google OAuth
   */
  async registerDriverWithGoogle(
    idToken: string,
  ): Promise<RegisterDriverStep1ResponseDto> {
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
      });

      if (user) {
        throw new ConflictException('This Google account is already registered');
      }

      // Check by email
      if (googleEmail) {
        user = await this.prisma.user.findUnique({
          where: { googleEmail },
        });

        if (user) {
          throw new ConflictException('This email is already registered');
        }
      }

      // Create user and driver
      return await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            googleId,
            googleEmail,
            firstName,
            secondName,
            image,
            phone: googleEmail || `google_${googleId}`,
            role: UserRole.DRIVER,
          },
        });

        const driver = await tx.driver.create({
          data: {
            userId: newUser.id,
            status: 'INCOMPLETE',
          },
        });

        // Generate JWT token
        const accessToken = this.jwtService.sign({
          sub: newUser.id,
          phone: newUser.phone!,
          role: newUser.role,
          profileId: driver.id,
          type: 'USER',
        } as JwtUserPayload);

        return {
          accessToken,
          user: {
            id: newUser.id,
            phone: newUser.phone!,
            firstName: newUser.firstName ?? undefined,
            secondName: newUser.secondName ?? undefined,
            image: newUser.image ?? undefined,
            myEmail: newUser.myEmail ?? undefined,
            userGender: newUser.userGender ?? undefined,
            role: 'DRIVER',
            createdAt: newUser.createdAt,
          },
          driver: {
            id: driver.id,
            userId: driver.userId,
            status: 'INCOMPLETE',
          },
          nextStep: 'step2',
        };
      });
    } catch (error: any) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  // ============================================
  // DRIVER AUTHENTICATION
  // ============================================

  /**
   * Driver Login with phone and password
   */
  async driverLogin(dto: DriverLoginDto): Promise<AuthTokensDto> {
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
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user has password set
    if (!user.password) {
      throw new BadRequestException(
        'This account uses Google OAuth. Please use Google sign-in.',
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if driver is suspended
    if (user.driver && user.driver.status === 'SUSPENDED') {
      throw new UnauthorizedException('Your account has been suspended');
    }

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
}
