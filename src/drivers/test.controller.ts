import { Controller, Post, Param, Get } from '@nestjs/common';
import { AdminApprovalService } from './services/admin-approval.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/auth.decorators';

/**
 * TEST CONTROLLER - REMOVE IN PRODUCTION
 * This controller provides endpoints for testing driver approval without authentication
 */
@Controller('test/drivers')
export class TestDriverController {
  constructor(
    private readonly adminApprovalService: AdminApprovalService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get all drivers with PENDING_REVIEW status
   * GET /test/drivers/pending
   */
  @Public()
  @Get('pending')
  async getPendingDrivers() {
    const drivers = await this.prisma.driver.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            secondName: true,
            myEmail: true,
          },
        },
        driverVerifications: {
          include: {
            documents: true,
          },
          orderBy: { submittedAt: 'desc' as const },
          take: 1,
        },
      },
    });

    return drivers.map(driver => {
      const latest = driver.driverVerifications[0] ?? null;
      return {
        driverId: driver.id,
        userId: driver.userId,
        status: driver.status,
        user: driver.user,
        vehicleType: driver.vehicleType,
        description: driver.description,
        documentType: latest?.documentType,
        submittedAt: latest?.submittedAt,
        documentsCount: latest?.documents.length || 0,
      };
    });
  }

  /**
   * Get all drivers (any status)
   * GET /test/drivers/all
   */
  @Public()
  @Get('all')
  async getAllDrivers() {
    const drivers = await this.prisma.driver.findMany({
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            secondName: true,
          },
        },
        performanceMetrics: true,
        driverAccount: true,
        weeklyAvailability: {
          include: {
            dayAvailabilities: {
              include: {
                timePeriods: true,
              },
            },
          },
        },
      },
    });

    return drivers.map(driver => ({
      driverId: driver.id,
      status: driver.status,
      user: driver.user,
      vehicleType: driver.vehicleType,
      approvedAt: driver.approvedAt,
      hasPerformanceMetrics: !!driver.performanceMetrics,
      hasDriverAccount: !!driver.driverAccount,
      hasWeeklyAvailability: !!driver.weeklyAvailability,
      weeklyAvailabilityDays: driver.weeklyAvailability?.dayAvailabilities.length || 0,
    }));
  }

  /**
   * Approve a driver (TEST ONLY - NO AUTH)
   * POST /test/drivers/:driverId/approve
   */
  @Public()
  @Post(':driverId/approve')
  async approveDriver(@Param('driverId') driverId: string) {
    try {
      const result = await this.adminApprovalService.approveDriver(driverId);
      
      // Fetch the driver with all initialized entities
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
        include: {
          user: {
            select: {
              phone: true,
              firstName: true,
              secondName: true,
            },
          },
          performanceMetrics: true,
          driverAccount: true,
          weeklyAvailability: {
            include: {
              dayAvailabilities: {
                include: {
                  timePeriods: true,
                },
              },
            },
          },
        },
      });

      return {
        success: true,
        message: 'Driver approved and initialized successfully',
        driver: {
          id: driver?.id,
          status: driver?.status,
          approvedAt: driver?.approvedAt,
          user: driver?.user,
          performanceMetrics: driver?.performanceMetrics,
          driverAccount: driver?.driverAccount,
          weeklyAvailability: {
            id: driver?.weeklyAvailability?.id,
            status: driver?.weeklyAvailability?.status,
            daysCount: driver?.weeklyAvailability?.dayAvailabilities.length,
            days: driver?.weeklyAvailability?.dayAvailabilities.map(day => ({
              dayOfWeek: day.dayOfWeek,
              timePeriodsCount: day.timePeriods.length,
              timePeriods: day.timePeriods.map(period => ({
                startTime: period.startTime,
                endTime: period.endTime,
              })),
            })),
          },
        },
        verificationResult: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get driver details with all entities
   * GET /test/drivers/:driverId/details
   */
  @Public()
  @Get(':driverId/details')
  async getDriverDetails(@Param('driverId') driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: true,
        performanceMetrics: true,
        driverAccount: {
          include: {
            transactions: true,
          },
        },
        weeklyAvailability: {
          include: {
            dayAvailabilities: {
              include: {
                timePeriods: true,
              },
            },
          },
        },
        driverVerifications: {
          include: {
            documents: true,
          },
          orderBy: { submittedAt: 'desc' as const },
        },
      },
    });

    if (!driver) {
      return { error: 'Driver not found' };
    }

    return {
      driver: {
        id: driver.id,
        status: driver.status,
        vehicleType: driver.vehicleType,
        description: driver.description,
        approvedAt: driver.approvedAt,
        suspendedAt: driver.suspendedAt,
      },
      user: driver.user,
      performanceMetrics: driver.performanceMetrics,
      driverAccount: {
        ...driver.driverAccount,
        transactionsCount: driver.driverAccount?.transactions.length || 0,
      },
      weeklyAvailability: driver.weeklyAvailability ? {
        id: driver.weeklyAvailability.id,
        status: driver.weeklyAvailability.status,
        daysCount: driver.weeklyAvailability.dayAvailabilities.length,
        days: driver.weeklyAvailability.dayAvailabilities.map(day => ({
          id: day.id,
          dayOfWeek: day.dayOfWeek,
          timePeriods: day.timePeriods,
        })),
      } : null,
      verifications: driver.driverVerifications,
    };
  }
}
