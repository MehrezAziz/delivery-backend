import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomerStatus,
  DriverStatus,
  OrderDriverArrivalConflictStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrderArrivalConflictService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: string) {
    return this.prisma.orderDriverArrivalConflict.findMany({
      where: status ? { status: status as OrderDriverArrivalConflictStatus } : undefined,
      include: {
        order: {
          include: {
            pickupAddress: { include: { delegation: { include: { governorate: true } } } },
          },
        },
        customer: { include: { user: { select: { id: true, phone: true, firstName: true, secondName: true } } } },
        driver: { include: { user: { select: { id: true, phone: true, firstName: true, secondName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async resolve(
    conflictId: string,
    superUserId: string,
    action: 'FORGIVE' | 'SUSPEND_CUSTOMER' | 'SUSPEND_DRIVER',
    note?: string,
  ) {
    const conflict = await this.prisma.orderDriverArrivalConflict.findUnique({
      where: { id: conflictId },
      include: { customer: true, driver: true },
    });
    if (!conflict) throw new NotFoundException('Incident not found');
    if (conflict.status !== OrderDriverArrivalConflictStatus.PENDING) {
      throw new BadRequestException('Incident already resolved');
    }

    const statusMap: Record<typeof action, OrderDriverArrivalConflictStatus> = {
      FORGIVE: OrderDriverArrivalConflictStatus.RESOLVED_FORGIVE,
      SUSPEND_CUSTOMER: OrderDriverArrivalConflictStatus.RESOLVED_SUSPEND_CUSTOMER,
      SUSPEND_DRIVER: OrderDriverArrivalConflictStatus.RESOLVED_SUSPEND_DRIVER,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDriverArrivalConflict.update({
        where: { id: conflictId },
        data: {
          status: statusMap[action],
          resolvedBySuperUserId: superUserId,
          resolvedAt: new Date(),
          resolutionNote: note?.trim() || null,
        },
      });

      if (action === 'SUSPEND_CUSTOMER') {
        await tx.customer.update({
          where: { id: conflict.customerId },
          data: { customerStatus: CustomerStatus.SUSPENDED },
        });
      }
      if (action === 'SUSPEND_DRIVER') {
        await tx.driver.update({
          where: { id: conflict.driverId },
          data: { status: DriverStatus.SUSPENDED, suspendedAt: new Date() },
        });
      }
    });

    return { message: 'Resolution recorded' };
  }
}
