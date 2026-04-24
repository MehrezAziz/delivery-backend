import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class ScheduledOrderNotificationsService {
  private readonly logger = new Logger(ScheduledOrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledOrdersAndPickupNotifications() {
    await this.publishDueOrders();
    await this.sendPickupNotifications();
  }

  private async publishDueOrders() {
    const due = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DRAFT,
        publishAt: { lte: new Date() },
      },
      select: {
        id: true,
        customerId: true,
        publishAt: true,
        cancelAfterMinutes: true,
        customer: { select: { userId: true } },
        pickupAddress: { select: { delegation: { select: { governorateId: true } } } },
      },
      take: 200,
    });
    for (const row of due) {
      try {
        const cancelMins = Math.max(1, Number(row.cancelAfterMinutes ?? 15));
        const resumeAt = row.publishAt ?? new Date();
        const published = await this.prisma.order.updateMany({
          where: { id: row.id, status: OrderStatus.DRAFT },
          data: {
            status: OrderStatus.SEARCHING_DRIVER,
            /** Auto-cancel window starts at scheduled publish time, not draft creation. */
            cancelTimerRemainingSeconds: cancelMins * 60,
            cancelTimerLastResumedAt: resumeAt,
            cancelTimerPausedAt: null,
          },
        });
        if (published.count === 0) continue;
        this.eventEmitter.emit('order.created', {
          orderId: row.id,
          customerId: row.customerId,
          userId: row.customer.userId,
          pickupGovernorateId: row.pickupAddress?.delegation?.governorateId,
        });
      } catch (e) {
        this.logger.warn(`Failed to publish scheduled order ${row.id}: ${String(e)}`);
      }
    }
  }

  private async sendPickupNotifications() {
    const now = new Date();
    const rows = await this.prisma.order.findMany({
      where: {
        pickupAt: { not: null },
        driverAssignment: { isNot: null },
        /** Pickup nudges only once the driver is confirmed on the order (not while waiting on customer). */
        status: { in: [OrderStatus.DRIVER_ASSIGNED, OrderStatus.DRIVER_ARRIVED] },
      },
      select: {
        id: true,
        status: true,
        pickupAt: true,
        pickupOriginalAt: true,
        pickupReminderAt: true,
        driverPickupReminderSentAt: true,
        driverPickupPersistentSentAt: true,
        driverAssignment: { select: { driver: { select: { userId: true } } } },
      },
      take: 400,
    });

    for (const row of rows) {
      const driverUserId = row.driverAssignment?.driver?.userId;
      if (!driverUserId) continue;

      /**
       * One native (tray) reminder per order: not under `order:` groupKey so it does not
       * reuse the driver foreground tracking channel / data-only order pipeline.
       * Skip if we are already inside the reminder window (e.g. driver accepted late).
       */
      if (row.pickupReminderAt && row.pickupReminderAt <= now) {
        const pickupAtMs = row.pickupAt ? new Date(row.pickupAt).getTime() : 0;
        const reminderAtMs = new Date(row.pickupReminderAt).getTime();
        const leadMs = pickupAtMs && reminderAtMs ? pickupAtMs - reminderAtMs : 0;
        const msUntilPickup = pickupAtMs - now.getTime();
        const tooLateForFullReminderWindow = leadMs > 0 && msUntilPickup < leadMs;

        const reminderClaim = await this.prisma.order.updateMany({
          where: {
            id: row.id,
            driverPickupReminderSentAt: null,
            pickupReminderAt: { lte: now },
          },
          data: { driverPickupReminderSentAt: now },
        });
        if (reminderClaim.count > 0) {
          if (!tooLateForFullReminderWindow) {
            await this.notificationsService.send({
              userId: driverUserId,
              userType: 'USER',
              type: NotificationType.PICKUP_REMINDER,
              title: 'Pickup coming soon',
              body: 'Your pickup appointment is approaching.',
              relatedEntityType: 'Order',
              relatedEntityId: row.id,
              groupKey: `pickup_reminder:${row.id}`,
              ongoing: false,
            });
          }
        }
      }

      /** Sticky driver tracking update only from pickupOriginalAt onward; single send (atomic claim). */
      if (row.pickupOriginalAt && row.pickupOriginalAt <= now) {
        const persistentClaim = await this.prisma.order.updateMany({
          where: {
            id: row.id,
            driverPickupPersistentSentAt: null,
            pickupOriginalAt: { lte: now },
          },
          data: { driverPickupPersistentSentAt: now, driverPickupPersistentIgnoredAt: null },
        });
        if (persistentClaim.count > 0) {
          await this.notificationsService.send({
            userId: driverUserId,
            userType: 'USER',
            type: NotificationType.PICKUP_REMINDER,
            title: 'Pickup time now active',
            body: 'Heads-up: your pickup window has started.',
            relatedEntityType: 'Order',
            relatedEntityId: row.id,
            groupKey: `order:${row.id}`,
            updateExisting: true,
            ongoing: true,
            orderStatus: row.status,
            trackingAudience: 'DRIVER',
          });
        }
      }
    }
  }
}
