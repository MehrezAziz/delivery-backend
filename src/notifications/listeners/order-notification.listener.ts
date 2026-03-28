import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class OrderNotificationListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('order.created')
  async handleOrderCreated(payload: { orderId: string; customerId: string; userId: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.ORDER_CREATED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
    });
  }

  @OnEvent('order.driver_assigned')
  async handleDriverAssigned(payload: {
    orderId: string;
    customerId: string;
    customerUserId: string;
    driverId: string;
    driverUserId: string;
    driverName: string;
  }) {
    // Notify customer
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DRIVER_ASSIGNED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      templateData: { driverName: payload.driverName },
    });
  }

  @OnEvent('order.driver_arrived')
  async handleDriverArrived(payload: { orderId: string; customerUserId: string }) {
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DRIVER_ARRIVED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
    });
  }

  @OnEvent('order.picked_up')
  async handlePickedUp(payload: { orderId: string; customerUserId: string }) {
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.PACKAGE_PICKED_UP,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
    });
  }

  @OnEvent('order.delivering')
  async handleDelivering(payload: { orderId: string; customerUserId: string }) {
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DELIVERY_IN_PROGRESS,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
    });
  }

  @OnEvent('order.delivered')
  async handleOrderDelivered(payload: {
    orderId: string;
    customerUserId: string;
    driverUserId: string;
  }) {
    // Notify customer
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.ORDER_DELIVERED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
    });
  }

  @OnEvent('order.cancelled')
  async handleOrderCancelled(payload: {
    orderId: string;
    customerUserId: string;
    driverUserId?: string;
    reason?: string;
  }) {
    // Notify customer
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.ORDER_CANCELLED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      templateData: { reason: payload.reason },
    });

    // Notify driver if assigned
    if (payload.driverUserId) {
      await this.notificationsService.send({
        userId: payload.driverUserId,
        userType: 'USER',
        type: NotificationType.ORDER_CANCELLED_BY_CUSTOMER,
        relatedEntityType: 'Order',
        relatedEntityId: payload.orderId,
        groupKey: `order:${payload.orderId}`,
      });
    }

    // Notify admins if cancelled after assignment
    if (payload.driverUserId) {
      await this.notificationsService.sendToAllAdmins(
        NotificationType.ORDER_CANCELLED_AFTER_ASSIGNMENT,
        {
          relatedEntityType: 'Order',
          relatedEntityId: payload.orderId,
        },
      );
    }
  }

  @OnEvent('order.no_driver_found')
  async handleNoDriverFound(payload: { orderId: string; customerUserId: string }) {
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.NO_DRIVER_FOUND,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
    });
  }
}
