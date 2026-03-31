import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class OrderNotificationListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('order.created')
  async handleOrderCreated(payload: { orderId: string; customerId: string; userId: string }) {
    // Notify customer
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.ORDER_CREATED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      ongoing: true,
    });

    // Notify all admins about new order
    await this.notificationsService.sendToAllAdmins(NotificationType.HIGH_VALUE_ORDER, {
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      title: 'New Order Created',
      body: 'A new delivery order has been created.',
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
    // Update the existing order notification for customer — driver is now confirmed
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DRIVER_ASSIGNED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      templateData: { driverName: payload.driverName, orderStatus: 'DRIVER_ASSIGNED' },
      updateExisting: true,
      ongoing: true,
    });
  }

  @OnEvent('order.pending_customer_approval')
  async handlePendingCustomerApproval(payload: {
    orderId: string;
    customerId: string;
    customerUserId: string;
    driverId: string;
    driverUserId: string;
    driverName: string;
  }) {
    // Notify customer that a driver wants to take their order — needs approval
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DRIVER_ASSIGNED, // Reuse type but with different template data
      title: `🚗 Driver Found! — ${payload.driverName}`,
      body: '◉———⛟———⌖———⌖———⌖———⌖———⌖',
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      orderStatus: 'PENDING_CUSTOMER_APPROVAL',
      updateExisting: true,
      ongoing: true,
      actionButtons: [
        { id: 'accept_driver', title: '✅ Accept Driver', action: 'accept_driver' },
        { id: 'see_driver', title: '👤 See Driver', action: 'see_driver' },
      ],
    });
  }

  @OnEvent('order.driver_arrived')
  async handleDriverArrived(payload: { orderId: string; customerUserId: string }) {
    // Update existing persistent notification — no new notification
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DRIVER_ARRIVED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      updateExisting: true,
      ongoing: true,
    });
  }

  @OnEvent('order.picked_up')
  async handlePickedUp(payload: { orderId: string; customerUserId: string }) {
    // Update existing persistent notification
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.PACKAGE_PICKED_UP,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      updateExisting: true,
      ongoing: true,
    });
  }

  @OnEvent('order.delivering')
  async handleDelivering(payload: { orderId: string; customerUserId: string }) {
    // Update existing persistent notification
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DELIVERY_IN_PROGRESS,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      updateExisting: true,
      ongoing: true,
    });
  }

  @OnEvent('order.delivered')
  async handleOrderDelivered(payload: {
    orderId: string;
    customerUserId: string;
    driverUserId: string;
  }) {
    // Final notification — update existing but make it DISMISSIBLE (not ongoing)
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.ORDER_DELIVERED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      updateExisting: true,
      ongoing: false, // Customer can now dismiss this notification
    });
  }

  @OnEvent('order.cancelled')
  async handleOrderCancelled(payload: {
    orderId: string;
    customerUserId: string;
    driverUserId?: string;
    reason?: string;
  }) {
    // Update existing notification — dismissible
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.ORDER_CANCELLED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      templateData: { reason: payload.reason },
      updateExisting: true,
      ongoing: false,
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
      updateExisting: true,
      ongoing: false,
    });
  }

  @OnEvent('order.driver_rejected')
  async handleDriverRejected(payload: { orderId: string; customerUserId: string }) {
    // Driver was rejected by customer — go back to searching
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.ORDER_CREATED, // Reuse "searching" template
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      title: '🔍 Searching for another driver...',
      body: '⛟————⌖————⌖————⌖————⌖————⌖————⌖',
      updateExisting: true,
      ongoing: true,
    });
  }

  @OnEvent('order.disputed')
  async handleOrderDisputed(payload: { orderId: string; customerUserId: string; reason: string }) {
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DISPUTE_OPENED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      title: '⚠️ Order Disputed',
      body: `Dispute opened: ${payload.reason}`,
      updateExisting: true,
      ongoing: false,
    });
  }
}
