import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

export interface TimePeriodDto {
  startHour: number; // 0-23
  endHour: number;   // 0-23
}

export interface DayAvailabilityDto {
  dayOfWeek: DayOfWeek;
  timePeriods: TimePeriodDto[];
}

export interface WeeklyAvailabilityDto {
  days: DayAvailabilityDto[];
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get driver's weekly availability
   */
  async getDriverAvailability(driverId: string) {
    const weeklyAvailability = await this.prisma.weeklyAvailability.findUnique({
      where: { driverId },
      include: {
        dayAvailabilities: {
          include: {
            timePeriods: true,
          },
          orderBy: {
            dayOfWeek: 'asc',
          },
        },
      },
    });

    if (!weeklyAvailability) {
      throw new NotFoundException('Weekly availability not found for this driver');
    }

    // Convert to frontend-friendly format
    const days = weeklyAvailability.dayAvailabilities.map(day => ({
      dayOfWeek: day.dayOfWeek,
      timePeriods: day.timePeriods.map(period => {
        const startDate = new Date(period.startTime);
        const endDate = new Date(period.endTime);
        const endHour = endDate.getUTCHours() === 23 && endDate.getUTCMinutes() === 59
          ? 24
          : endDate.getUTCHours();
        return {
          startHour: startDate.getUTCHours(),
          endHour,
        };
      }),
    }));

    return {
      id: weeklyAvailability.id,
      status: weeklyAvailability.status,
      days,
    };
  }

  /**
   * Update driver's weekly availability
   */
  async updateDriverAvailability(driverId: string, dto: WeeklyAvailabilityDto) {
    // Validate driver exists and is verified
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { weeklyAvailability: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.status !== 'VERIFIED') {
      throw new BadRequestException('Only verified drivers can update availability');
    }

    if (!driver.weeklyAvailability) {
      throw new NotFoundException('Weekly availability not initialized');
    }

    // Validate input
    this.validateAvailabilityDto(dto);

    // Update in transaction
    await this.prisma.$transaction(async (tx) => {
      const weeklyAvailabilityId = driver.weeklyAvailability!.id;

      // Delete all existing day availabilities and their time periods (cascade)
      await tx.dayAvailability.deleteMany({
        where: { weeklyAvailabilityId },
      });

      // Create new day availabilities with time periods
      for (const dayDto of dto.days) {
        if (dayDto.timePeriods.length === 0) {
          // Skip days with no availability
          continue;
        }

        // Create day availability
        const dayAvailability = await tx.dayAvailability.create({
          data: {
            weeklyAvailabilityId,
            dayOfWeek: dayDto.dayOfWeek,
          },
        });

        // Create time periods for this day
        for (const period of dayDto.timePeriods) {
          await tx.timePeriod.create({
            data: {
              dayAvailabilityId: dayAvailability.id,
              startTime: new Date(`1970-01-01T${String(period.startHour).padStart(2, '0')}:00:00Z`),
              endTime: period.endHour === 24
                ? new Date('1970-01-01T23:59:59Z')
                : new Date(`1970-01-01T${String(period.endHour).padStart(2, '0')}:00:00Z`),
            },
          });
        }
      }
    });

    // Return updated availability
    return this.getDriverAvailability(driverId);
  }

  /**
   * Toggle availability status (ACTIVE/INACTIVE)
   */
  async toggleAvailabilityStatus(driverId: string) {
    const weeklyAvailability = await this.prisma.weeklyAvailability.findUnique({
      where: { driverId },
    });

    if (!weeklyAvailability) {
      throw new NotFoundException('Weekly availability not found');
    }

    const newStatus = weeklyAvailability.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    await this.prisma.weeklyAvailability.update({
      where: { id: weeklyAvailability.id },
      data: { status: newStatus },
    });

    return { status: newStatus };
  }

  /**
   * Validate availability DTO
   */
  private validateAvailabilityDto(dto: WeeklyAvailabilityDto) {
    const validDays: DayOfWeek[] = [
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ];

    for (const day of dto.days) {
      if (!validDays.includes(day.dayOfWeek)) {
        throw new BadRequestException(`Invalid day of week: ${day.dayOfWeek}`);
      }

      for (const period of day.timePeriods) {
        if (period.startHour < 0 || period.startHour > 23) {
          throw new BadRequestException(`Invalid start hour: ${period.startHour}`);
        }
        if (period.endHour < 1 || period.endHour > 24) {
          throw new BadRequestException(`Invalid end hour: ${period.endHour}`);
        }
        if (period.startHour >= period.endHour) {
          throw new BadRequestException(
            `Start hour must be before end hour: ${period.startHour} >= ${period.endHour}`,
          );
        }
      }
    }
  }
}
