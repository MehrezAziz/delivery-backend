import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DriverAssignmentService } from './driver-assignment.service';
import { NotificationType, OrderStatus, DriverStatus } from '@prisma/client';

function driverScore(
  avgDeliveryTimeMinutes: number | null | undefined,
  avgRating: number | null | undefined,
  balance: number,
): number {
  const t = avgDeliveryTimeMinutes && avgDeliveryTimeMinutes > 0 ? avgDeliveryTimeMinutes : 120;
  const inv = 100 / t;
  const r = avgRating != null ? Number(avgRating) : 5;
  const bonus = balance >= 0 ? 10 : 0;
  return inv + r + bonus;
}

@Injectable()
export class OrderUrgentNotifyService {
  private readonly logger = new Logger(OrderUrgentNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly driverAssignmentService: DriverAssignmentService,
  ) {}

  /**
   * Ranked available drivers in order pickup delegation (verified, schedule on, not rejected on order).
   */
  private async getRankedEligibleDrivers(orderId: string, delegationId: string) {
    const rejections = await this.prisma.orderDriverRejection.findMany({
      where: { orderId },
      select: { driverId: true },
    });
    const rejected = new Set(rejections.map((r) => r.driverId));

    const drivers = await this.prisma.driver.findMany({
      where: {
        status: DriverStatus.VERIFIED,
        user: { addresses: { some: { delegationId } } },
      },
      include: {
        user: { select: { id: true } },
        driverAccount: true,
        performanceMetrics: true,
        weeklyAvailability: {
          include: { dayAvailabilities: { include: { timePeriods: true } } },
        },
      },
    });

    const eligible = drivers.filter(
      (d) =>
        !rejected.has(d.id) &&
        this.driverAssignmentService.isDriverCurrentlyAvailable(d.weeklyAvailability),
    );

    eligible.sort((a, b) => {
      const balA = a.driverAccount ? Number(a.driverAccount.balance) : 0;
      const balB = b.driverAccount ? Number(b.driverAccount.balance) : 0;
      const sa = driverScore(
        a.performanceMetrics?.avgDeliveryTimeMinutes,
        a.performanceMetrics?.avgRating ? Number(a.performanceMetrics.avgRating) : null,
        balA,
      );
      const sb = driverScore(
        b.performanceMetrics?.avgDeliveryTimeMinutes,
        b.performanceMetrics?.avgRating ? Number(b.performanceMetrics.avgRating) : null,
        balB,
      );
      return sb - sa;
    });

    return eligible;
  }

  private async sendBatch(orderId: string, cycleId: string): Promise<number> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { pickupAddress: true, driverAssignment: true },
    });
    if (!order || order.status !== OrderStatus.SEARCHING_DRIVER || order.driverAssignment) return 0;
    if (!order.pickupAddress) return 0;

    const delegationId = order.pickupAddress.delegationId;
    const ranked = await this.getRankedEligibleDrivers(orderId, delegationId);

    const existingTargets = await this.prisma.orderUrgentNotifyTarget.findMany({
      where: { orderId, cycleId },
      select: { driverId: true },
    });
    const already = new Set(existingTargets.map((t) => t.driverId));

    let slice = ranked.filter((d) => !already.has(d.id)).slice(0, 10);

    if (slice.length === 0) {
      return 0;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const d of slice) {
        await tx.orderUrgentNotifyTarget.create({
          data: { orderId, cycleId, driverId: d.id, waveIndex: 1 },
        });
      }
      await tx.order.update({
        where: { id: orderId },
        data: { urgentNotifyWavesSent: { increment: 1 } },
      });
    });

    for (const d of slice) {
      await this.notificationsService.send({
        userId: d.user.id,
        userType: 'USER',
        type: NotificationType.NEW_ORDER_AVAILABLE,
        title: '🔔 Customer asked to notify drivers — new order',
        body: 'A customer requested driver alerts for an urgent order in your area. Open the app to view it.',
        relatedEntityType: 'Order',
        relatedEntityId: orderId,
        groupKey: `order:${orderId}`,
      });
    }

    this.logger.log(`Urgent notify batch for order ${orderId}: ${slice.length} drivers`);
    return slice.length;
  }

  async customerRequestNotify(orderId: string, userId: string): Promise<{ message: string; notifiedDrivers: number }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, pickupAddress: true, driverAssignment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.SEARCHING_DRIVER) {
      throw new BadRequestException('Notify is only available while searching for a driver');
    }
    if (order.driverAssignment) {
      throw new BadRequestException('A driver is already assigned');
    }

    const minOrderAge = order.createdAt.getTime() + 5 * 60_000;
    if (Date.now() < minOrderAge) {
      throw new BadRequestException('You can notify drivers 5 minutes after creating the order');
    }

    const lastBtn = order.urgentNotifyLastButtonAt;
    if (lastBtn) {
      const next = lastBtn.getTime() + 15 * 60_000;
      if (Date.now() < next) {
        throw new BadRequestException('You can notify again 15 minutes after the previous click');
      }
    }

    const cycleId = order.urgentNotifyCycleId || order.id;
    const now = new Date();
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        urgentNotifyCycleId: cycleId,
        urgentNotifyCycleStartedAt: now,
        urgentNotifyLastButtonAt: now,
      },
    });

    const notified = await this.sendBatch(orderId, cycleId);
    return { message: `We notified ${notified} drivers for you.`, notifiedDrivers: notified };
  }
}
