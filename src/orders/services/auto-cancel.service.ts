import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AutoCancelService {
  private readonly logger = new Logger(AutoCancelService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cancelExpiredOrders(): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.SEARCHING_DRIVER },
    });

    const now = new Date();
    const expiredOrders = orders.filter(
      (order) =>
        now > new Date(order.createdAt.getTime() + order.cancelAfterMinutes * 60000),
    );

    let cancelledCount = 0;

    for (const order of expiredOrders) {
      try {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELLED },
        });
        this.logger.log(
          `Auto-cancelled: no driver responded within ${order.cancelAfterMinutes} minutes (order ${order.id})`,
        );
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
}
