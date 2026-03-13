import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

@Injectable()
export class DriverInitializationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize all required entities when driver is verified
   * Creates: DriverPerformanceMetrics, DriverAccount, WeeklyAvailability
   */
  async initializeVerifiedDriver(driverId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Create DriverPerformanceMetrics
      const existingMetrics = await tx.driverPerformanceMetrics.findUnique({
        where: { driverId },
      });

      if (!existingMetrics) {
        await tx.driverPerformanceMetrics.create({
          data: {
            driverId,
            totalOrders: 0,
            completedOrders: 0,
            cancelledOrders: 0,
            avgRating: null,
            avgDeliveryTimeMinutes: null,
            completionRate: null,
            onTimeRate: null,
          },
        });
      }

      // 2. Create DriverAccount
      const existingAccount = await tx.driverAccount.findUnique({
        where: { driverId },
      });

      if (!existingAccount) {
        await tx.driverAccount.create({
          data: {
            driverId,
            balance: 0,
            currency: 'TND',
            avgDeliveryTime: null,
            completedDeliveries: 0,
          },
        });
      }

      // 3. Create WeeklyAvailability with default DayAvailability for all days
      const existingAvailability = await tx.weeklyAvailability.findUnique({
        where: { driverId },
      });

      if (!existingAvailability) {
        // Create WeeklyAvailability
        const weeklyAvailability = await tx.weeklyAvailability.create({
          data: {
            driverId,
            status: 'ACTIVE',
          },
        });

        // Create DayAvailability for all 7 days with default time periods
        const daysOfWeek: DayOfWeek[] = [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ];

        for (const dayOfWeek of daysOfWeek) {
          // Create DayAvailability
          const dayAvailability = await tx.dayAvailability.create({
            data: {
              weeklyAvailabilityId: weeklyAvailability.id,
              dayOfWeek,
            },
          });

          // Create default time period (9 AM to 6 PM)
          await tx.timePeriod.create({
            data: {
              dayAvailabilityId: dayAvailability.id,
              startTime: new Date('1970-01-01T09:00:00Z'),
              endTime: new Date('1970-01-01T18:00:00Z'),
            },
          });
        }
      }
    });
  }

  /**
   * Check if driver has all required entities initialized
   */
  async isDriverInitialized(driverId: string): Promise<boolean> {
    const [metrics, account, availability] = await Promise.all([
      this.prisma.driverPerformanceMetrics.findUnique({
        where: { driverId },
      }),
      this.prisma.driverAccount.findUnique({
        where: { driverId },
      }),
      this.prisma.weeklyAvailability.findUnique({
        where: { driverId },
      }),
    ]);

    return !!(metrics && account && availability);
  }
}
