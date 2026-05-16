import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class CustomerReferralNotificationListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @OnEvent('referral.commission_paid')
  async handleReferralCommissionPaid(payload: {
    referrerUserId: string;
    commissionCoins: number;
    orderId: string;
  }) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: payload.referrerUserId },
      select: { notifyReferralCommission: true },
    });
    if (!customer?.notifyReferralCommission) return;

    const amountLabel =
      Number.isFinite(payload.commissionCoins) && payload.commissionCoins > 0
        ? `${payload.commissionCoins.toFixed(2)} coins`
        : '';

    await this.notificationsService.send({
      userId: payload.referrerUserId,
      userType: 'USER',
      type: NotificationType.REFERRAL_BONUS,
      templateData: { amount: amountLabel },
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
    });
  }
}
