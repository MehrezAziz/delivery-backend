import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadDocumentsDto, DriverVerificationResponseDto } from '../dto/driver-verification.dto';
import { UserRole, DriverStatus, VerificationStatus } from '@prisma/client';
import { MlVerificationService } from './ml-verification.service';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mlVerificationService: MlVerificationService,
  ) {}

  async uploadDocuments(userId: string, dto: UploadDocumentsDto): Promise<DriverVerificationResponseDto> {
    // Check if user is a driver
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driver: true },
    });

    if (!user || user.role !== UserRole.DRIVER || !user.driver) {
      throw new ForbiddenException('Only drivers can upload verification documents');
    }

    const driverId = user.driver.id;

    // Always create a new DriverVerification (1:* relation)
    const verification = await this.prisma.driverVerification.create({
      data: {
        driverId,
        documentType: dto.documentType,
        submittedAt: new Date(),
      },
    });

    // Create document record
    const doc = await this.prisma.document.create({
      data: {
        verificationId: verification.id,
        documentImage: dto.documentImage,
        selfieImage: dto.selfieImage,
        docImageTop: dto.docImageTop,
        docImageBottom: dto.docImageBottom,
        verificationStatus: VerificationStatus.SUBMITTED,
      },
    });
    this.mlVerificationService.scheduleAnalysis(doc.id);

    // Update driver status to PENDING_REVIEW
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.PENDING_REVIEW },
    });

    return this.getVerificationStatus(userId);
  }

  async getVerificationStatus(userId: string): Promise<DriverVerificationResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        driver: {
          include: {
            driverVerifications: {
              include: {
                documents: true,
              },
              orderBy: { submittedAt: 'desc' },
            },
          },
        },
      },
    });

    if (!user || !user.driver) {
      throw new NotFoundException('Driver not found');
    }

    const driver = user.driver;
    const latestVerification = driver.driverVerifications[0] ?? null;

    return {
      driverId: driver.id,
      status: driver.status,
      documentType: latestVerification?.documentType || null,
      submittedAt: latestVerification?.submittedAt || null,
      verifiedAt: latestVerification?.verifiedAt || null,
      approvedAt: driver.approvedAt,
      suspendedAt: driver.suspendedAt,
      documents:
        latestVerification?.documents.map((doc) => ({
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
        })) || [],
    };
  }
}
