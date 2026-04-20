import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService, DocumentFiles } from '../documents/documents.service';

/** Step 3 multipart: selfie optional when submitting with a recent liveness checkpoint. */
export type Step3UploadFiles = {
  selfieImage?: Express.Multer.File;
  docImageTop: Express.Multer.File;
  docImageBottom?: Express.Multer.File;
};
import { JwtService } from '@nestjs/jwt';
import { RegisterDriverStep2Dto } from '../auth/dto/register-driver-step2.dto';
import { RegisterDriverStep3Dto } from '../auth/dto/register-driver-step3.dto';
import { RegisterDriverStep2ResponseDto } from '../auth/dto/register-driver-step2-response.dto';
import { RegisterDriverStep3ResponseDto } from '../auth/dto/register-driver-step3-response.dto';
import { DriverProfileDto } from './dto/driver-profile.dto';
import { DriverStatus, Prisma, UserRole } from '@prisma/client';
import { JwtUserPayload } from '../auth/dto/jwt-payload.interface';
import { DriverPendingPayload } from '../auth/dto/driver-pending-payload.interface';
import { MlVerificationService } from './services/ml-verification.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly jwtService: JwtService,
    private readonly mlVerificationService: MlVerificationService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Driver Registration Step 2: Decode pending token, create user+driver+address atomically.
   * Returns a real access token on success.
   */
  async completeDriverProfile(
    pendingToken: string,
    dto: RegisterDriverStep2Dto,
  ): Promise<RegisterDriverStep2ResponseDto> {
    const { vehicleType, description, delegationId, street } = dto;

    // Decode and verify the pending token
    let pending: DriverPendingPayload;
    try {
      pending = this.jwtService.verify<DriverPendingPayload>(pendingToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired registration session. Please start over.');
    }

    if (pending.type !== 'DRIVER_PENDING') {
      throw new UnauthorizedException('Invalid registration token.');
    }

    // Validate delegation exists
    const delegation = await this.prisma.delegation.findUnique({ where: { id: delegationId } });
    if (!delegation) throw new NotFoundException('Delegation not found');

    // Commit everything in one transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create User
      const user = await tx.user.create({
        data: {
          phone: pending.phone ?? null,
          password: pending.hashedPassword ?? null,
          firstName: pending.firstName ?? null,
          secondName: pending.secondName ?? null,
          myEmail: pending.myEmail ?? null,
          userGender: (pending.userGender as any) ?? null,
          image: pending.image ?? null,
          googleId: pending.googleId ?? null,
          googleEmail: pending.googleEmail ?? null,
          role: UserRole.DRIVER,
        },
      });

      // Create Driver
      const driver = await tx.driver.create({
        data: { userId: user.id, vehicleType, description, status: 'INCOMPLETE' },
      });

      // Create Address (lat/lng/street are null — only delegation is required)
      await tx.address.create({
        data: {
          delegationId,
          street: street ?? null,
          latitude: null,
          longitude: null,
          userId: user.id,
        },
      });

      // Create default full-week availability (all day, every day)
      const weeklyAvail = await tx.weeklyAvailability.create({
        data: { driverId: driver.id, status: 'ACTIVE' },
      });
      const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
      for (const day of days) {
        const dayAvail = await tx.dayAvailability.create({
          data: { weeklyAvailabilityId: weeklyAvail.id, dayOfWeek: day },
        });
        await tx.timePeriod.create({
          data: {
            dayAvailabilityId: dayAvail.id,
            startTime: new Date('1970-01-01T00:00:00Z'),
            endTime: new Date('1970-01-01T23:59:00Z'),
          },
        });
      }

      // Issue real access token
      const accessToken = this.jwtService.sign({
        sub: user.id,
        phone: user.phone,
        role: user.role,
        profileId: driver.id,
        type: 'USER',
      } as JwtUserPayload);

      return {
        accessToken,
        driver: {
          id: driver.id,
          userId: driver.userId,
          vehicleType: driver.vehicleType!,
          description: driver.description ?? undefined,
          status: 'INCOMPLETE' as const,
        },
        nextStep: 'step3' as const,
      };
    });
    const driverName = `${pending.firstName ?? ''} ${pending.secondName ?? ''}`.trim() || 'Unknown';
    this.eventEmitter.emit('driver.registered', {
      driverUserId: result.driver.userId,
      driverName,
    });
    return result;
  }

  /**
   * Driver Registration Step 3: Submit Document Verification
   */
  async submitDocumentVerification(
    userId: string,
    dto: RegisterDriverStep3Dto,
    files: Step3UploadFiles,
  ): Promise<RegisterDriverStep3ResponseDto> {
    const { documentType, livenessSession } = dto;
    const usePending = dto.usePendingLiveness === 'true';

    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            firstName: true,
            secondName: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found. Please complete step 1 first.');
    }

    if (!driver.vehicleType) {
      throw new BadRequestException('Please complete step 2 first.');
    }

    if (!files.docImageTop) {
      throw new BadRequestException('Document front image is required');
    }

    let livenessPayload: Record<string, unknown> | null = null;
    let documentUrls: { selfieImage: string; docImageTop: string; docImageBottom?: string };

    if (usePending) {
      if (
        !driver.pendingLivenessExpiresAt ||
        driver.pendingLivenessExpiresAt.getTime() <= Date.now() ||
        !driver.pendingVerificationSelfieUrl ||
        !driver.pendingLivenessSession
      ) {
        throw new BadRequestException(
          'Saved liveness has expired or is missing. Please complete the liveness check again.',
        );
      }
      livenessPayload = driver.pendingLivenessSession as Record<string, unknown>;
      const docOnly = await this.documentsService.uploadDocImagesOnly(
        {
          docImageTop: files.docImageTop,
          docImageBottom: files.docImageBottom,
        },
        userId,
      );
      documentUrls = {
        selfieImage: driver.pendingVerificationSelfieUrl,
        docImageTop: docOnly.docImageTop,
        docImageBottom: docOnly.docImageBottom,
      };
    } else {
      if (!files.selfieImage) {
        throw new BadRequestException('Selfie image is required');
      }
      if (!livenessSession) {
        throw new BadRequestException('Liveness session is required');
      }
      try {
        livenessPayload = JSON.parse(livenessSession) as Record<string, unknown>;
      } catch {
        throw new BadRequestException('Invalid livenessSession JSON payload');
      }
      await this.validateAndConsumeLivenessSession(driver.id, livenessPayload);
      documentUrls = await this.documentsService.uploadDocumentImages(
        {
          selfieImage: files.selfieImage,
          docImageTop: files.docImageTop,
          docImageBottom: files.docImageBottom,
        } as DocumentFiles,
        userId,
      );
    }

    let createdDocumentId = '';
    const step3 = await this.prisma.$transaction(async (tx) => {
      const driverVerification = await tx.driverVerification.create({
        data: {
          driverId: driver.id,
          documentType,
          submittedAt: new Date(),
        },
      });

      const document = await tx.document.create({
        data: {
          verificationId: driverVerification.id,
          selfieImage: documentUrls.selfieImage,
          docImageTop: documentUrls.docImageTop,
          docImageBottom: documentUrls.docImageBottom,
          verificationStatus: 'SUBMITTED',
          mlAnalysis: {
            stage: 'REGISTRATION_SUBMISSION',
            livenessSession: livenessPayload,
            recommendation: 'PENDING_STAFF_REVIEW',
            note: 'Automated verification evidence submitted during registration step 3.',
            submittedAt: new Date().toISOString(),
          } as any,
        },
      });
      createdDocumentId = document.id;

      const updatedDriver = await tx.driver.update({
        where: { id: driver.id },
        data: {
          status: 'PENDING_REVIEW',
          pendingLivenessSession: Prisma.DbNull,
          pendingVerificationSelfieUrl: null,
          pendingLivenessExpiresAt: null,
        },
      });

      return {
        driverVerification: {
          id: driverVerification.id,
          driverId: driverVerification.driverId,
          documentType: driverVerification.documentType,
          submittedAt: driverVerification.submittedAt!,
        },
        document: {
          id: document.id,
          verificationId: document.verificationId,
          selfieImage: document.selfieImage!,
          docImageTop: document.docImageTop!,
          docImageBottom: document.docImageBottom ?? undefined,
          verificationStatus: document.verificationStatus,
        },
        driver: {
          id: updatedDriver.id,
          status: DriverStatus.PENDING_REVIEW,
        },
        message:
          'Your documents have been submitted for review. You will be notified once verified.',
      };
    });

    if (createdDocumentId) {
      this.mlVerificationService.scheduleAnalysis(createdDocumentId);
    }
    const driverName = `${driver.user.firstName ?? ''} ${driver.user.secondName ?? ''}`.trim() || 'Unknown';
    this.eventEmitter.emit('driver.documents_submitted', {
      driverUserId: userId,
      driverName,
    });
    return step3;
  }

  /**
   * Persist completed liveness (selfie + session JSON) for up to 24h so the driver can upload documents later.
   */
  async saveLivenessCheckpoint(
    userId: string,
    livenessSessionRaw: string,
    selfieFile: Express.Multer.File,
  ): Promise<{ ok: true; expiresAt: string }> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(livenessSessionRaw) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid livenessSession JSON payload');
    }

    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    if (!driver.vehicleType) {
      throw new BadRequestException('Please complete step 2 first.');
    }

    this.validateLivenessCheckpointPayload(payload);

    const selfieUrl = await this.documentsService.uploadLivenessCheckpointSelfie(selfieFile, userId);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.driver.update({
      where: { id: driver.id },
      data: {
        pendingLivenessSession: payload as object,
        pendingVerificationSelfieUrl: selfieUrl,
        pendingLivenessExpiresAt: expiresAt,
      },
    });

    return { ok: true, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Whether the driver still has a valid saved liveness checkpoint (for resuming document upload).
   */
  async getVerificationDraft(userId: string): Promise<{
    pendingLivenessValid: boolean;
    pendingLivenessExpiresAt: string | null;
  }> {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: {
        pendingLivenessExpiresAt: true,
        pendingLivenessSession: true,
        pendingVerificationSelfieUrl: true,
      },
    });

    if (
      !driver?.pendingLivenessExpiresAt ||
      !driver.pendingLivenessSession ||
      !driver.pendingVerificationSelfieUrl
    ) {
      return { pendingLivenessValid: false, pendingLivenessExpiresAt: null };
    }

    const valid = driver.pendingLivenessExpiresAt.getTime() > Date.now();
    return {
      pendingLivenessValid: valid,
      pendingLivenessExpiresAt: driver.pendingLivenessExpiresAt.toISOString(),
    };
  }

  /**
   * Get Driver Profile
   */
  async getDriverProfile(userId: string): Promise<DriverProfileDto> {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: {
        user: {
          include: {
            addresses: {
              include: { delegation: { include: { governorate: { include: { country: true } } } } },
              take: 1,
            },
          },
        },
        driverAccount: true,
        driverLocations: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
        driverVerifications: {
          include: {
            documents: {
              take: 1,
              orderBy: { id: 'desc' },
            },
          },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Auto-pause check: if balance is negative, calculate days remaining
    let daysRemainingToPay: number | undefined;
    let maxNegativeDays: number | undefined;
    if (driver.driverAccount && Number(driver.driverAccount.balance) < 0) {
      // Backfill negativeBalanceSince if not set yet (for drivers who went negative before this feature)
      if (!driver.driverAccount.negativeBalanceSince) {
        await this.prisma.driverAccount.update({
          where: { id: driver.driverAccount.id },
          data: { negativeBalanceSince: new Date() },
        });
        driver.driverAccount.negativeBalanceSince = new Date();
      }

      // Get the pricing policy for the driver's country to find maxNegativeDays
      const driverAddress = driver.user.addresses[0];
      if (driverAddress) {
        const pricingPolicy = await this.prisma.countryPricingPolicy.findFirst({
          where: { countryId: driverAddress.delegation.governorate.country.id, isActive: true },
        });
        if (pricingPolicy) {
          maxNegativeDays = pricingPolicy.maxNegativeDays;
          const daysSinceNegative = Math.floor(
            (Date.now() - new Date(driver.driverAccount.negativeBalanceSince).getTime()) / (1000 * 60 * 60 * 24),
          );
          daysRemainingToPay = Math.max(0, maxNegativeDays - daysSinceNegative);

          // Auto-pause if days exceeded and driver is currently VERIFIED
          if (daysRemainingToPay <= 0 && driver.status === DriverStatus.VERIFIED) {
            await this.prisma.driver.update({
              where: { id: driver.id },
              data: { status: DriverStatus.PAUSED },
            });
            driver.status = DriverStatus.PAUSED;
          }
        }
      }
    }

    const latestVerification = driver.driverVerifications[0] ?? null;

    return {
      id: driver.id,
      userId: driver.userId,
      vehicleType: driver.vehicleType ?? undefined,
      status: driver.status,
      description: driver.description ?? undefined,
      approvedAt: driver.approvedAt ?? undefined,
      suspendedAt: driver.suspendedAt ?? undefined,
      user: {
        id: driver.user.id,
        phone: driver.user.phone!,
        firstName: driver.user.firstName ?? undefined,
        secondName: driver.user.secondName ?? undefined,
        image: driver.user.image ?? undefined,
        myEmail: driver.user.myEmail ?? undefined,
        userGender: driver.user.userGender ?? undefined,
        hasPassword: !!driver.user.password,
      },
      driverLocation: driver.driverLocations[0]
        ? {
            latitude: driver.driverLocations[0].latitude,
            longitude: driver.driverLocations[0].longitude,
          }
        : undefined,
      verification: latestVerification
        ? {
            documentType: latestVerification.documentType,
            submittedAt: latestVerification.submittedAt ?? undefined,
            verifiedAt: latestVerification.verifiedAt ?? undefined,
            document: latestVerification.documents[0]
              ? {
                  verificationStatus:
                    latestVerification.documents[0].verificationStatus,
                }
              : undefined,
          }
        : undefined,
      account: driver.driverAccount
        ? {
            balance: Number(driver.driverAccount.balance),
            currency: driver.driverAccount.currency,
            completedDeliveries: driver.driverAccount.completedDeliveries,
            negativeBalanceSince: driver.driverAccount.negativeBalanceSince ?? undefined,
            daysRemainingToPay,
            maxNegativeDays,
          }
        : undefined,
    };
  }

  /**
   * Update driver profile (phone, vehicleType, description, gender)
   */
  async updateDriverProfile(userId: string, data: {
    phone?: string; vehicleType?: string; description?: string; userGender?: string;
  }) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver not found');

    // Update user fields (phone, gender)
    const userUpdate: any = {};
    if (data.phone !== undefined) {
      if (data.phone) {
        const existingUser = await this.prisma.user.findUnique({ where: { phone: data.phone } });
        if (existingUser && existingUser.id !== userId) {
          throw new BadRequestException('This phone number is already in use');
        }
      }
      userUpdate.phone = data.phone || null;
    }
    if (data.userGender !== undefined) userUpdate.userGender = data.userGender || null;
    if (Object.keys(userUpdate).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data: userUpdate });
    }

    // Update driver fields
    const driverUpdate: any = {};
    if (data.vehicleType !== undefined) driverUpdate.vehicleType = data.vehicleType || null;
    if (data.description !== undefined) driverUpdate.description = data.description || null;
    if (Object.keys(driverUpdate).length > 0) {
      await this.prisma.driver.update({ where: { id: driver.id }, data: driverUpdate });
    }

    return this.getDriverProfile(userId);
  }

  /**
   * Get driver's addresses with full geography info (delegation/governorate/country)
   */
  async getDriverGeography(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: {
          include: {
            addresses: {
              include: {
                delegation: {
                  include: {
                    governorate: {
                      include: { country: true },
                    },
                  },
                },
              },
            },
          },
        },
        weeklyAvailability: {
          include: { dayAvailabilities: { include: { timePeriods: true } } },
        },
      },
    });

    if (!driver) throw new NotFoundException('Driver not found');

    // Check if driver is currently within their availability schedule
    const isCurrentlyAvailable = this.isDriverCurrentlyAvailable(driver.weeklyAvailability);

    const addresses = driver.user.addresses.map((addr) => ({
      id: addr.id,
      street: addr.street,
      delegation: {
        id: addr.delegation.id,
        nameDelegation: addr.delegation.nameDelegation,
      },
      governorate: {
        id: addr.delegation.governorate.id,
        nameGovernorate: addr.delegation.governorate.nameGovernorate,
      },
      country: {
        id: addr.delegation.governorate.country.id,
        name: addr.delegation.governorate.country.name,
      },
    }));

    // Deduplicate delegations, governorates, countries
    const delegationsMap = new Map<string, { id: string; nameDelegation: string }>();
    const governoratesMap = new Map<string, { id: string; nameGovernorate: string }>();
    const countriesMap = new Map<string, { id: string; name: string }>();

    for (const addr of addresses) {
      delegationsMap.set(addr.delegation.id, addr.delegation);
      governoratesMap.set(addr.governorate.id, addr.governorate);
      countriesMap.set(addr.country.id, addr.country);
    }

    return {
      isAvailable: isCurrentlyAvailable,
      addresses,
      delegations: Array.from(delegationsMap.values()),
      governorates: Array.from(governoratesMap.values()),
      countries: Array.from(countriesMap.values()),
    };
  }

  private isDriverCurrentlyAvailable(weeklyAvailability: any): boolean {
    if (!weeklyAvailability || weeklyAvailability.status !== 'ACTIVE') return false;
    const now = new Date();
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayName = dayNames[now.getDay()];
    const todayAvail = weeklyAvailability.dayAvailabilities?.find(
      (d: any) => d.dayOfWeek === todayName,
    );
    if (!todayAvail || !todayAvail.timePeriods?.length) return false;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return todayAvail.timePeriods.some((tp: any) => {
      const start = new Date(tp.startTime);
      const end = new Date(tp.endTime);
      const startMin = start.getUTCHours() * 60 + start.getUTCMinutes();
      const endMin = end.getUTCHours() * 60 + end.getUTCMinutes();
      return currentMinutes >= startMin && currentMinutes <= endMin;
    });
  }

  /**
   * Get Driver Transaction History
   */
  async getDriverTransactions(userId: string, page = 1, limit = 20) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { driverAccount: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    if (!driver.driverAccount) throw new NotFoundException('No account found');

    const accountId = driver.driverAccount.id;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.driverTransaction.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.driverTransaction.count({ where: { accountId } }),
    ]);

    return {
      balance: Number(driver.driverAccount.balance),
      currency: driver.driverAccount.currency,
      transactions: transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        description: t.description,
        balanceAfter: Number(t.balanceAfter),
        createdAt: t.createdAt,
        referenceId: t.referenceId ?? null,
        referenceType: t.referenceType ?? null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }


  /**
   * Update Driver Status
   */
  async updateDriverStatus(driverId: string, status: DriverStatus) {
    return this.prisma.driver.update({
      where: { id: driverId },
      data: { status },
    });
  }

  /**
   * Check if driver can accept orders
   */
  async canAcceptOrders(driverId: string): Promise<boolean> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return false;
    }

    return driver.status === 'VERIFIED';
  }

  /**
   * Get driver's received ratings with customer info
   */
  async getDriverRatings(driverId: string) {
    const ratings = await this.prisma.rating.findMany({
      where: { driverId },
      include: {
        customer: { include: { user: { select: { firstName: true, secondName: true } } } },
        order: { select: { id: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const metrics = await this.prisma.driverPerformanceMetrics.findUnique({
      where: { driverId },
      select: { avgRating: true, totalOrders: true, completedOrders: true },
    });

    return {
      avgRating: metrics?.avgRating ? Number(metrics.avgRating) : null,
      totalRatings: ratings.length,
      completedOrders: metrics?.completedOrders || 0,
      ratings: ratings.map(r => ({
        id: r.id,
        score: r.score,
        comment: r.comment,
        createdAt: r.createdAt,
        customerName: r.customer?.user ? `${r.customer.user.firstName || ''} ${r.customer.user.secondName || ''}`.trim() : 'Customer',
        orderId: r.order?.id || null,
      })),
    };
  }

  private validateLivenessCheckpointPayload(payload: Record<string, unknown>): void {
    const nonce = typeof payload.nonce === 'string' ? payload.nonce : '';
    const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : 0;
    const passed = payload.passed === true;
    const steps = Array.isArray(payload.steps) ? payload.steps : [];

    if (!passed || steps.length < 4 || !nonce || !timestamp) {
      throw new BadRequestException('Invalid liveness evidence payload');
    }

    if (Math.abs(Date.now() - timestamp) > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Liveness evidence expired, please capture the challenge again');
    }
  }

  private async validateAndConsumeLivenessSession(
    driverId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const nonce = typeof payload.nonce === 'string' ? payload.nonce : '';
    const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : 0;
    const passed = payload.passed === true;
    const steps = Array.isArray(payload.steps) ? payload.steps : [];

    if (!passed || steps.length < 2 || !nonce || !timestamp) {
      throw new BadRequestException('Invalid liveness evidence payload');
    }

    // Challenge freshness guard (10 min) + anti-replay nonce stored in Redis.
    if (Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      throw new BadRequestException('Liveness evidence expired, please recapture');
    }

    const key = `liveness:nonce:${driverId}:${nonce}`;
    const set = await this.redis.set(key, '1', 'EX', 15 * 60, 'NX');
    if (set !== 'OK') {
      throw new BadRequestException('Liveness evidence already used (replay blocked)');
    }
  }
}
