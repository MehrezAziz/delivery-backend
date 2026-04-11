import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentResponseDto, DriverVerificationResponseDto } from '../dto/driver-verification.dto';
import { CustomerServiceRole, DriverStatus, SuperUserRole, VerificationStatus } from '@prisma/client';
import type { AuthenticatedSuperUser } from '../../auth/dto/jwt-payload.interface';
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
        driverVerifications: {
          include: { documents: true },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    return drivers.map(driver => {
      const latest = driver.driverVerifications[0] ?? null;
      return {
        driverId: driver.id,
        status: driver.status,
        documentType: latest?.documentType || null,
        submittedAt: latest?.submittedAt || null,
        verifiedAt: latest?.verifiedAt || null,
        approvedAt: driver.approvedAt,
        suspendedAt: driver.suspendedAt,
        documents: latest?.documents.map((doc) => this.mapDocumentToDto(doc)) || [],
      };
    });
  }

  async getDriverVerificationHistoryForStaff(
    staff: AuthenticatedSuperUser,
    driverId: string,
  ): Promise<DriverVerificationResponseDto[]> {
    await this.assertStaffCanReview(staff);
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        driverVerifications: {
          include: { documents: true },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return driver.driverVerifications.map((verification) => ({
      driverId: driver.id,
      status: driver.status,
      documentType: verification.documentType,
      submittedAt: verification.submittedAt || null,
      verifiedAt: verification.verifiedAt || null,
      approvedAt: driver.approvedAt,
      suspendedAt: driver.suspendedAt,
      documents: verification.documents.map((doc) => this.mapDocumentToDto(doc)),
    }));
  }

  async approveDriver(driverId: string): Promise<DriverVerificationResponseDto> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        driverVerifications: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (
      driver.status !== DriverStatus.PENDING_REVIEW &&
      driver.status !== DriverStatus.REJECTED
    ) {
      throw new BadRequestException('Driver must be pending review or rejected to approve');
    }

    // Update driver status and set approvedAt
    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: DriverStatus.VERIFIED,
        approvedAt: new Date(),
      },
    });

    const now = new Date();
    const open = await this.prisma.userRestriction.findMany({
      where: { userId: driver.userId, liftedAt: null },
      select: { id: true },
    });
    for (const row of open) {
      await this.prisma.userRestriction.update({
        where: { id: row.id },
        data: { liftedAt: now },
      });
    }

    // Update the latest verification record
    const latestVerification = driver.driverVerifications[0];
    if (latestVerification) {
      await this.prisma.driverVerification.update({
        where: { id: latestVerification.id },
        data: { verifiedAt: new Date() },
      });

      // Update all documents in this verification to VERIFIED
      await this.prisma.document.updateMany({
        where: { verificationId: latestVerification.id },
        data: { verificationStatus: VerificationStatus.VERIFIED },
      });
    }

    // Initialize driver entities (DriverPerformanceMetrics, DriverAccount, WeeklyAvailability)
    await this.driverInitializationService.initializeVerifiedDriver(driverId);

    return this.getDriverVerification(driverId);
  }

  private async assertStaffCanReview(staff: AuthenticatedSuperUser): Promise<void> {
    if (staff.role === SuperUserRole.ADMIN) {
      return;
    }

    const cs = await this.prisma.customerService.findUnique({
      where: { id: staff.profileId },
      select: { roles: true },
    });
    if (!cs || !cs.roles.includes(CustomerServiceRole.VERIFY_ACCOUNTS)) {
      throw new BadRequestException(
        'Customer service role VERIFY_ACCOUNTS is required for verification history access',
      );
    }
  }

  async rejectDriver(driverId: string, reason: string): Promise<DriverVerificationResponseDto> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        driverVerifications: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
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

    // Update all documents in the latest verification to REJECTED
    const latestVerification = driver.driverVerifications[0];
    if (latestVerification) {
      await this.prisma.document.updateMany({
        where: { verificationId: latestVerification.id },
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
        driverVerifications: {
          include: { documents: true },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const latest = driver.driverVerifications[0] ?? null;
    return {
      driverId: driver.id,
      status: driver.status,
      documentType: latest?.documentType || null,
      submittedAt: latest?.submittedAt || null,
      verifiedAt: latest?.verifiedAt || null,
      approvedAt: driver.approvedAt,
      suspendedAt: driver.suspendedAt,
      documents: latest?.documents.map((doc) => this.mapDocumentToDto(doc)) || [],
    };
  }

  private mapDocumentToDto(doc: {
    id: string;
    documentImage: string | null;
    selfieImage: string | null;
    docImageTop: string | null;
    docImageBottom: string | null;
    verificationStatus: VerificationStatus;
    selfieVerified: boolean;
    firstName: string | null;
    lastName: string | null;
    idNumber: string | null;
    dateOfBirth: Date | null;
    translationLocale: string | null;
    translationData: unknown;
    mlAnalysis: unknown;
  }): DocumentResponseDto {
    return {
      id: doc.id,
      documentImage: doc.documentImage,
      selfieImage: doc.selfieImage,
      docImageTop: doc.docImageTop,
      docImageBottom: doc.docImageBottom,
      verificationStatus: doc.verificationStatus,
      selfieVerified: doc.selfieVerified,
      firstName: doc.firstName,
      lastName: doc.lastName,
      idNumber: doc.idNumber,
      dateOfBirth: doc.dateOfBirth,
      translationLocale: doc.translationLocale,
      translationData: (doc.translationData as Record<string, unknown> | null) ?? null,
      mlAnalysis: doc.mlAnalysis as Record<string, unknown> | null,
    };
  }
}
