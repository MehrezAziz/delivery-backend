import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
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

  @Cron('*/45 * * * * *')
  async processScheduledWaves(): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
        urgentNotifyWavesSent: { in: [1, 2] },
        urgentNotifyCycleStartedAt: { not: null },
        urgentNotifyCycleId: { not: null },
      },
      include: {
        pickupAddress: { include: { delegation: true } },
        driverAssignment: true,
      },
    });

    const now = Date.now();
    for (const order of orders) {
      if (order.driverAssignment) continue;
      const start = order.urgentNotifyCycleStartedAt!.getTime();
      const thirdMs = (order.cancelAfterMinutes / 3) * 60_000;
      const wave = order.urgentNotifyWavesSent;

      if (wave === 1 && now >= start + thirdMs) {
        await this.sendWave(order.id, order.urgentNotifyCycleId!, 2);
      } else if (wave === 2 && now >= start + 2 * thirdMs) {
        await this.sendWave(order.id, order.urgentNotifyCycleId!, 3);
      }
    }
  }

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

  private async sendWave(orderId: string, cycleId: string, waveIndex: 1 | 2 | 3): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { pickupAddress: true, driverAssignment: true },
    });
    if (!order || order.status !== OrderStatus.SEARCHING_DRIVER || order.driverAssignment) return;
    if (!order.pickupAddress) return;

    if (order.urgentNotifyWavesSent !== waveIndex - 1) return;

    const delegationId = order.pickupAddress.delegationId;
    const ranked = await this.getRankedEligibleDrivers(orderId, delegationId);
    const n = ranked.length;

    const existingTargets = await this.prisma.orderUrgentNotifyTarget.findMany({
      where: { orderId, cycleId },
      select: { driverId: true },
    });
    const already = new Set(existingTargets.map((t) => t.driverId));

    const chunk = Math.max(1, Math.ceil(n / 3));
    let slice: typeof ranked;
    if (waveIndex === 1) slice = ranked.slice(0, chunk);
    else if (waveIndex === 2) slice = ranked.slice(chunk, Math.min(2 * chunk, n));
    else slice = ranked.slice(2 * chunk);

    slice = slice.filter((d) => !already.has(d.id));

    if (slice.length === 0) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { urgentNotifyWavesSent: waveIndex },
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const d of slice) {
        await tx.orderUrgentNotifyTarget.create({
          data: { orderId, cycleId, driverId: d.id, waveIndex },
        });
      }
      await tx.order.update({
        where: { id: orderId },
        data: { urgentNotifyWavesSent: waveIndex },
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

    this.logger.log(`Urgent notify wave ${waveIndex} for order ${orderId}: ${slice.length} drivers`);
  }

  async customerRequestNotify(orderId: string, userId: string): Promise<{ message: string }> {
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

    const waves = order.urgentNotifyWavesSent;
    const lastBtn = order.urgentNotifyLastButtonAt;

    if (waves > 0 && waves < 3) {
      throw new BadRequestException('A notify cycle is in progress. Wait for all driver groups to be contacted.');
    }

    if (waves === 3 && lastBtn) {
      const next = lastBtn.getTime() + 15 * 60_000;
      if (Date.now() < next) {
        throw new BadRequestException('You can start another notify cycle 15 minutes after the last one');
      }
    }

    const cycleId = randomUUID();
    const now = new Date();
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        urgentNotifyCycleId: cycleId,
        urgentNotifyCycleStartedAt: now,
        urgentNotifyLastButtonAt: now,
        urgentNotifyWavesSent: 0,
      },
    });

    await this.sendWave(orderId, cycleId, 1);
    return { message: 'Drivers are being notified in groups.' };
  }
}
