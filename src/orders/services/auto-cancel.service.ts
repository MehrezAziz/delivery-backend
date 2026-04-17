import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryCompanyTransactionType, OrderSourceType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AutoCancelService {
  private readonly logger = new Logger(AutoCancelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
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
            data: { status: OrderStatus.CANCELLED },
            include: { customer: true },
          });
          if (updated.deliveryCompanyId && updated.sourceType === OrderSourceType.DELIVERY_COMPANY) {
            const company = await tx.deliveryCompany.findUnique({ where: { id: updated.deliveryCompanyId } });
            if (company) {
              const price = Math.round(Number(updated.price || 0) * 100) / 100;
              const reserve = Math.round(price * 0.5 * 100) / 100;
              const unlock = Math.min(Number(company.lockedCoins), reserve);
              const restoreAmount = Math.round((price + unlock) * 100) / 100;
              const nextBalance = Math.round((Number(company.coinBalance) + restoreAmount) * 100) / 100;
              const nextLocked = Math.max(0, Number(company.lockedCoins) - unlock);
              await tx.deliveryCompany.update({
                where: { id: company.id },
                data: { coinBalance: nextBalance, lockedCoins: nextLocked },
              });
              await tx.deliveryCompanyTransaction.create({
                data: {
                  deliveryCompanyId: company.id,
                  orderId: updated.id,
                  type: DeliveryCompanyTransactionType.ADMIN_ADJUSTMENT,
                  amount: restoreAmount,
                  balanceAfter: nextBalance,
                  description: `Budget rollback for CANCELLED order ${updated.id}`,
                },
              });
            }
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
