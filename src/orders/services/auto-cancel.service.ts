import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderSourceType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { rollbackDeliveryCompanyOrderFundsInTx } from '../../delivery-company/company-order-budget.util';

@Injectable()
export class AutoCancelService {
  private readonly logger = new Logger(AutoCancelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async cancelExpiredOrders(): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.SEARCHING_DRIVER },
    });

    const expiredOrders = orders.filter((order) => this.computeCancelRemainingSeconds(order) <= 0);

    let cancelledCount = 0;

    for (const order of expiredOrders) {
      try {
        const cancelledOrder = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'AUTO_CANCELLED' as OrderStatus,
              cancelTimerRemainingSeconds: 0,
              cancelTimerLastResumedAt: null,
              cancelTimerPausedAt: new Date(),
            },
            include: { customer: true },
          });
          if (updated.deliveryCompanyId && updated.sourceType === OrderSourceType.DELIVERY_COMPANY) {
            await rollbackDeliveryCompanyOrderFundsInTx(tx, updated, 'AUTO_CANCELLED');
          }
          return updated;
        });
        this.logger.log(
          `Auto-cancelled: no driver responded within ${order.cancelAfterMinutes} minutes (order ${order.id})`,
        );
        // Emit no_driver_found event for notification
        this.eventEmitter.emit('order.no_driver_found', {
          orderId: order.id,
          customerUserId: cancelledOrder.customer.userId,
        });
        cancelledCount++;
      } catch (error) {
        this.logger.error(
          `Failed to auto-cancel order ${order.id}: ${error}`,
        );
      }
    }

    if (cancelledCount > 0) {
      this.logger.log(`Auto-cancelled ${cancelledCount} expired order(s)`);
    }

    return cancelledCount;
  }

  private computeCancelRemainingSeconds(order: any): number {
    const fallback = Math.max(0, Number(order.cancelAfterMinutes ?? 15) * 60);
    const baseRemaining = typeof order.cancelTimerRemainingSeconds === 'number'
      ? order.cancelTimerRemainingSeconds
      : fallback;
    const lastResumedAt = order.cancelTimerLastResumedAt ? new Date(order.cancelTimerLastResumedAt).getTime() : null;
    if (!lastResumedAt) return Math.max(0, baseRemaining);
    const elapsedSec = Math.floor((Date.now() - lastResumedAt) / 1000);
    return Math.max(0, baseRemaining - elapsedSec);
  }
}
