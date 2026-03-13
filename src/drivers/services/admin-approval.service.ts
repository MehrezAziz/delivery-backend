import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverVerificationResponseDto } from '../dto/driver-verification.dto';
import { DriverStatus, VerificationStatus } from '@prisma/client';
import { DriverInitializationService } from './driver-initialization.service';

@Injectable()
export class AdminApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driverInitializationService: DriverInitializationService,
  ) {}

  async getPendingDrivers(): Promise<DriverVerificationResponseDto[]> {
    const drivers = await this.prisma.driver.findMany({
      where: { status: DriverStatus.PENDING_REVIEW },
      include: {
        driverVerification: {
          include: {
            documents: true,
          },
        },
      },
    });

    return drivers.map(driver => ({
      driverId: driver.id,
      status: driver.status,
      documentType: driver.driverVerification?.documentType || null,
      submittedAt: driver.driverVerification?.submittedAt || null,
      verifiedAt: driver.driverVerification?.verifiedAt || null,
      approvedAt: driver.approvedAt,
      suspendedAt: driver.suspendedAt,
      documents: driver.driverVerification?.documents.map(doc => ({
        id: doc.id,
        documentImage: doc.documentImage,
        selfieImage: doc.selfieImage,
        docImageTop: doc.docImageTop,
        docImageBottom: doc.docImageBottom,
        verificationStatus: doc.verificationStatus,
      })) || [],
    }));
  }

  async approveDriver(driverId: string): Promise<DriverVerificationResponseDto> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { driverVerification: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.status !== DriverStatus.PENDING_REVIEW) {
      throw new BadRequestException('Driver is not pending review');
    }

    // Update driver status and set approvedAt
    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: DriverStatus.VERIFIED,
        approvedAt: new Date(),
      },
    });

    // Update verification record
    if (driver.driverVerification) {
      await this.prisma.driverVerification.update({
        where: { id: driver.driverVerification.id },
        data: { verifiedAt: new Date() },
      });

      // Update all documents to VERIFIED
      await this.prisma.document.updateMany({
        where: { verificationId: driver.driverVerification.id },
        data: { verificationStatus: VerificationStatus.VERIFIED },
      });
    }

    // Initialize driver entities (DriverPerformanceMetrics, DriverAccount, WeeklyAvailability)
    await this.driverInitializationService.initializeVerifiedDriver(driverId);

    return this.getDriverVerification(driverId);
  }

  async rejectDriver(driverId: string, reason: string): Promise<DriverVerificationResponseDto> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { driverVerification: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.status !== DriverStatus.PENDING_REVIEW) {
      throw new BadRequestException('Driver is not pending review');
    }

    // Update driver status
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.REJECTED },
    });

    // Update all documents to REJECTED
    if (driver.driverVerification) {
      await this.prisma.document.updateMany({
        where: { verificationId: driver.driverVerification.id },
        data: { verificationStatus: VerificationStatus.REJECTED },
      });
    }

    return this.getDriverVerification(driverId);
  }

  async suspendDriver(driverId: string, reason: string): Promise<DriverVerificationResponseDto> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update driver status and set suspendedAt
    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: DriverStatus.SUSPENDED,
        suspendedAt: new Date(),
      },
    });

    return this.getDriverVerification(driverId);
  }

  private async getDriverVerification(driverId: string): Promise<DriverVerificationResponseDto> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        driverVerification: {
          include: {
            documents: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return {
      driverId: driver.id,
      status: driver.status,
      documentType: driver.driverVerification?.documentType || null,
      submittedAt: driver.driverVerification?.submittedAt || null,
      verifiedAt: driver.driverVerification?.verifiedAt || null,
      approvedAt: driver.approvedAt,
      suspendedAt: driver.suspendedAt,
      documents: driver.driverVerification?.documents.map(doc => ({
        id: doc.id,
        documentImage: doc.documentImage,
        selfieImage: doc.selfieImage,
        docImageTop: doc.docImageTop,
        docImageBottom: doc.docImageBottom,
        verificationStatus: doc.verificationStatus,
      })) || [],
    };
  }
}
