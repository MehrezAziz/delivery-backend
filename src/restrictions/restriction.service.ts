import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRestrictionResponseDto } from './dto/restriction.dto';
import { RestrictionType, DriverStatus, CustomerStatus } from '@prisma/client';

@Injectable()
export class RestrictionService {
  constructor(private readonly prisma: PrismaService) {}

  async blockUser(userId: string, reason: string, adminId: string): Promise<UserRestrictionResponseDto> {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true, driver: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create BLOCK restriction with no endDate (permanent)
    const restriction = await this.prisma.userRestriction.create({
      data: {
        userId,
        type: RestrictionType.BLOCK,
        reason,
        imposedBy: adminId,
        endDate: null, // Permanent block
      },
    });

    // Update customer or driver status to BLOCKED/SUSPENDED
    if (user.customer) {
      await this.prisma.customer.update({
        where: { id: user.customer.id },
        data: { customerStatus: CustomerStatus.BLOCKED },
      });
    } else if (user.driver) {
      await this.prisma.driver.update({
        where: { id: user.driver.id },
        data: { status: DriverStatus.SUSPENDED },
      });
    }

    return this.mapToResponseDto(restriction);
  }

  async suspendUser(
    userId: string,
    reason: string,
    durationDays: number,
    adminId: string,
  ): Promise<UserRestrictionResponseDto> {
    // Check if user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Calculate endDate
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // Create SUSPENSION restriction
    const restriction = await this.prisma.userRestriction.create({
      data: {
        userId,
        type: RestrictionType.SUSPENSION,
        reason,
        imposedBy: adminId,
        endDate,
      },
    });

    return this.mapToResponseDto(restriction);
  }

  async suspendDriver(
    driverId: string,
    reason: string,
    durationDays: number,
    adminId: string,
  ): Promise<UserRestrictionResponseDto> {
    // Get driver and user
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Update driver status to SUSPENDED
    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: DriverStatus.SUSPENDED,
        suspendedAt: new Date(),
      },
    });

    // Calculate endDate
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // Create SUSPENSION restriction for the user
    const restriction = await this.prisma.userRestriction.create({
      data: {
        userId: driver.userId,
        type: RestrictionType.SUSPENSION,
        reason,
        imposedBy: adminId,
        endDate,
      },
    });

    return this.mapToResponseDto(restriction);
  }

  async liftRestriction(restrictionId: string): Promise<void> {
    const restriction = await this.prisma.userRestriction.findUnique({
      where: { id: restrictionId },
    });

    if (!restriction) {
      throw new NotFoundException('Restriction not found');
    }

    // Set liftedAt timestamp
    await this.prisma.userRestriction.update({
      where: { id: restrictionId },
      data: { liftedAt: new Date() },
    });

    // Check if user has any other active restrictions
    const hasOtherActiveRestrictions = await this.hasActiveRestrictions(restriction.userId);

    // If no other active restrictions, restore customer/driver status to ACTIVE/VERIFIED
    if (!hasOtherActiveRestrictions) {
      const user = await this.prisma.user.findUnique({
        where: { id: restriction.userId },
        include: { customer: true, driver: true },
      });

      if (user?.customer) {
        await this.prisma.customer.update({
          where: { id: user.customer.id },
          data: { customerStatus: CustomerStatus.ACTIVE },
        });
      }

      // If it was a driver suspension, restore driver status to VERIFIED
      if (user?.driver && user.driver.status === DriverStatus.SUSPENDED && user.driver.approvedAt) {
        await this.prisma.driver.update({
          where: { id: user.driver.id },
          data: { status: DriverStatus.VERIFIED },
        });
      }
    }
  }

  async hasActiveRestrictions(userId: string): Promise<boolean> {
    const activeRestriction = await this.prisma.userRestriction.findFirst({
      where: {
        userId,
        liftedAt: null,
        OR: [
          { endDate: null }, // Permanent
          { endDate: { gt: new Date() } }, // Not yet expired
        ],
      },
    });

    return !!activeRestriction;
  }

  async getActiveRestrictions(userId: string): Promise<UserRestrictionResponseDto[]> {
    const restrictions = await this.prisma.userRestriction.findMany({
      where: {
        userId,
        liftedAt: null,
        OR: [
          { endDate: null },
          { endDate: { gt: new Date() } },
        ],
      },
    });

    return restrictions.map(r => this.mapToResponseDto(r));
  }

  private mapToResponseDto(restriction: any): UserRestrictionResponseDto {
    return {
      id: restriction.id,
      userId: restriction.userId,
      type: restriction.type,
      reason: restriction.reason,
      imposedBy: restriction.imposedBy,
      startDate: restriction.startDate,
      endDate: restriction.endDate,
      liftedAt: restriction.liftedAt,
      createdAt: restriction.createdAt,
    };
  }
}
