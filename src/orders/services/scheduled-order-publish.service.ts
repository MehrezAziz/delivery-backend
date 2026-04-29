import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Moves PENDING_PUBLISH → SEARCHING_DRIVER at scheduledPublishAt and emits the same
 * `order.created` flow as an immediate order (driver notifications, CS, customer tracking).
 */
@Injectable()
export class ScheduledOrderPublishService {
  private readonly logger = new Logger(ScheduledOrderPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishDueOrders(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING_PUBLISH,
        scheduledPublishAt: { lte: now },
      },
      select: { id: true },
    });
    for (const row of due) {
      try {
        await this.publishOrder(row.id);
      } catch (e: any) {
        this.logger.error(`Failed to publish order ${row.id}: ${e?.message ?? e}`);
      }
    }
  }

  private async publishOrder(orderId: string): Promise<void> {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        pickupAddress: { include: { delegation: true } },
      },
    });
    if (!existing || existing.status !== OrderStatus.PENDING_PUBLISH) return;

    const pickupGovernorateId = existing.pickupAddress?.delegation?.governorateId;
    if (!pickupGovernorateId) {
      this.logger.warn(`Order ${orderId} missing pickup governorate; skipping publish`);
      return;
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SEARCHING_DRIVER,
        scheduledPublishAt: null,
        cancelTimerLastResumedAt: new Date(),
        cancelTimerPausedAt: null,
      },
    });

    this.eventEmitter.emit('order.created', {
      orderId: existing.id,
      customerId: existing.customerId,
      userId: existing.customer.userId,
      pickupGovernorateId,
    });
    this.logger.log(`Published scheduled order ${orderId} to SEARCHING_DRIVER`);
  }
}
