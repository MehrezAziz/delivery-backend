import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService, DocumentFiles } from '../documents/documents.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDriverStep2Dto } from '../auth/dto/register-driver-step2.dto';
import { RegisterDriverStep3Dto } from '../auth/dto/register-driver-step3.dto';
import { RegisterDriverStep2ResponseDto } from '../auth/dto/register-driver-step2-response.dto';
import { RegisterDriverStep3ResponseDto } from '../auth/dto/register-driver-step3-response.dto';
import { DriverProfileDto } from './dto/driver-profile.dto';
import { DriverStatus, UserRole } from '@prisma/client';
import { JwtUserPayload } from '../auth/dto/jwt-payload.interface';
import { DriverPendingPayload } from '../auth/dto/driver-pending-payload.interface';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly jwtService: JwtService,
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
    return await this.prisma.$transaction(async (tx) => {
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
          status: 'INCOMPLETE',
        },
        nextStep: 'step3',
      };
    });
  }

  /**
   * Driver Registration Step 3: Submit Document Verification
   */
  async submitDocumentVerification(
    userId: string,
    dto: RegisterDriverStep3Dto,
    files: DocumentFiles,
  ): Promise<RegisterDriverStep3ResponseDto> {
    const { documentType } = dto;

    // Find driver by userId
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found. Please complete step 1 first.');
    }

    // Verify step 2 completed (vehicleType must exist)
    if (!driver.vehicleType) {
      throw new BadRequestException('Please complete step 2 first.');
    }

    // Upload document images
    const documentUrls = await this.documentsService.uploadDocumentImages(files, userId);

    // Create verification and document in transaction
    return await this.prisma.$transaction(async (tx) => {
      // Create DriverVerification
      const driverVerification = await tx.driverVerification.create({
        data: {
          driverId: driver.id,
          documentType,
          submittedAt: new Date(),
        },
      });

      // Create Document
      const document = await tx.document.create({
        data: {
          verificationId: driverVerification.id,
          selfieImage: documentUrls.selfieImage,
          docImageTop: documentUrls.docImageTop,
          docImageBottom: documentUrls.docImageBottom,
          verificationStatus: 'SUBMITTED',
        },
      });

      // Update Driver status to PENDING_REVIEW
      const updatedDriver = await tx.driver.update({
        where: { id: driver.id },
        data: {
          status: 'PENDING_REVIEW',
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
          status: 'PENDING_REVIEW',
        },
        message:
          'Your documents have been submitted for review. You will be notified once verified.',
      };
    });
  }

  /**
   * Get Driver Profile
   */
  async getDriverProfile(userId: string): Promise<DriverProfileDto> {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: {
        user: true,
        driverLocations: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
        driverVerification: {
          include: {
            documents: {
              take: 1,
              orderBy: { id: 'desc' },
            },
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

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
      },
      driverLocation: driver.driverLocations[0]
        ? {
            latitude: driver.driverLocations[0].latitude,
            longitude: driver.driverLocations[0].longitude,
          }
        : undefined,
      verification: driver.driverVerification
        ? {
            documentType: driver.driverVerification.documentType,
            submittedAt: driver.driverVerification.submittedAt ?? undefined,
            verifiedAt: driver.driverVerification.verifiedAt ?? undefined,
            document: driver.driverVerification.documents[0]
              ? {
                  verificationStatus:
                    driver.driverVerification.documents[0].verificationStatus,
                }
              : undefined,
          }
        : undefined,
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
}
