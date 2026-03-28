import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class DriverOpportunityListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('order.available_for_drivers')
  async handleOrderAvailable(payload: { orderId: string; driverUserIds: string[] }) {
    const promises = payload.driverUserIds.map((driverUserId) =>
      this.notificationsService.send({
        userId: driverUserId,
        userType: 'USER',
        type: NotificationType.NEW_ORDER_AVAILABLE,
        relatedEntityType: 'Order',
        relatedEntityId: payload.orderId,
        actionButtons: [{ id: 'view_order', title: 'View Order', action: 'VIEW_ORDER' }],
      }),
    );
    await Promise.allSettled(promises);
  }

  @OnEvent('order.expired')
  async handleOrderExpired(payload: { orderId: string; driverUserId: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.ORDER_EXPIRED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
    });
  }

  @OnEvent('driver.pickup_reminder')
  async handlePickupReminder(payload: { orderId: string; driverUserId: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.PICKUP_REMINDER,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
    });
  }

  @OnEvent('driver.rated')
  async handleDriverRated(payload: { driverUserId: string; score: number; orderId: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.CUSTOMER_RATED_YOU,
      relatedEntityType: 'Rating',
      relatedEntityId: payload.orderId,
      templateData: { score: payload.score },
    });
  }

  @OnEvent('driver.performance_milestone')
  async handlePerformanceMilestone(payload: { driverUserId: string; count: number }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.PERFORMANCE_MILESTONE,
      templateData: { count: payload.count },
    });
  }

  @OnEvent('referral.bonus_earned')
  async handleReferralBonus(payload: { userId: string; amount: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.REFERRAL_BONUS,
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('referral.friend_registered')
  async handleFriendRegistered(payload: { referrerUserId: string }) {
    await this.notificationsService.send({
      userId: payload.referrerUserId,
      userType: 'USER',
      type: NotificationType.REFERRED_FRIEND_REGISTERED,
    });
  }
}
