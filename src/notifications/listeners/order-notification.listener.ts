import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

/** Progress line for driver persistent notification (same visual language as customer). */
function driverTrackLine(currentStep: number): string {
  const total = 7;
  const parts: string[] = [];
  for (let i = 0; i < total; i++) {
    if (i < currentStep) parts.push('◉');
    else if (i === currentStep) parts.push('⛟');
    else parts.push('⌖');
    if (i < total - 1) parts.push('———');
  }
  return parts.join('');
}

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

    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.DRIVER_ASSIGNED,
      title: '✅ Customer approved — Head to pickup',
      body: driverTrackLine(2),
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      orderStatus: 'DRIVER_ASSIGNED',
      updateExisting: true,
      ongoing: true,
      trackingAudience: 'DRIVER',
      actionButtons: [{ id: 'driver_mark_arrived', title: "📍 I've arrived", action: 'mark_arrived' }],
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

    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.DRIVER_ASSIGNED,
      title: '⏳ Waiting for customer approval',
      body: driverTrackLine(1),
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      orderStatus: 'PENDING_CUSTOMER_APPROVAL',
      updateExisting: true,
      ongoing: true,
      trackingAudience: 'DRIVER',
      actionButtons: [{ id: 'driver_contact_customer', title: '💬 Contact customer', action: 'contact_customer' }],
    });
  }

  @OnEvent('order.driver_arrived')
  async handleDriverArrived(payload: { orderId: string; customerUserId: string; driverUserId?: string }) {
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

    if (payload.driverUserId) {
      await this.notificationsService.send({
        userId: payload.driverUserId,
        userType: 'USER',
        type: NotificationType.DRIVER_ARRIVED,
        title: '📍 At pickup — Confirm pickup',
        body: driverTrackLine(3),
        relatedEntityType: 'Order',
        relatedEntityId: payload.orderId,
        groupKey: `order:${payload.orderId}`,
        orderStatus: 'DRIVER_ARRIVED',
        updateExisting: true,
        ongoing: true,
        trackingAudience: 'DRIVER',
        actionButtons: [{ id: 'driver_mark_picked_up', title: '📦 Package picked up', action: 'mark_picked_up' }],
      });
    }
  }

  @OnEvent('order.picked_up')
  async handlePickedUp(payload: { orderId: string; customerUserId: string; driverUserId?: string }) {
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

    if (payload.driverUserId) {
      await this.notificationsService.send({
        userId: payload.driverUserId,
        userType: 'USER',
        type: NotificationType.PACKAGE_PICKED_UP,
        title: '📦 Picked up — Go to dropoff',
        body: driverTrackLine(4),
        relatedEntityType: 'Order',
        relatedEntityId: payload.orderId,
        groupKey: `order:${payload.orderId}`,
        orderStatus: 'PICKED_UP',
        updateExisting: true,
        ongoing: true,
        trackingAudience: 'DRIVER',
        actionButtons: [{ id: 'driver_mark_delivering', title: '🚚 Start delivering', action: 'mark_delivering' }],
      });
    }
  }

  @OnEvent('order.delivering')
  async handleDelivering(payload: { orderId: string; customerUserId: string; driverUserId?: string }) {
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

    if (payload.driverUserId) {
      await this.notificationsService.send({
        userId: payload.driverUserId,
        userType: 'USER',
        type: NotificationType.DELIVERY_IN_PROGRESS,
        title: '🚚 Delivering — Add proof to finish',
        body: driverTrackLine(5),
        relatedEntityType: 'Order',
        relatedEntityId: payload.orderId,
        groupKey: `order:${payload.orderId}`,
        orderStatus: 'DELIVERING',
        updateExisting: true,
        ongoing: true,
        trackingAudience: 'DRIVER',
        actionButtons: [{ id: 'driver_open_deliver', title: '✅ Delivered (add proof)', action: 'open_deliver_proofs' }],
      });
    }
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

    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.ORDER_DELIVERED,
      title: '✅ Order delivered',
      body: driverTrackLine(6),
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      orderStatus: 'DELIVERED',
      updateExisting: true,
      ongoing: false,
      trackingAudience: 'DRIVER',
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
        title: '⊘ Order cancelled',
        body: 'This order has been cancelled.',
        relatedEntityType: 'Order',
        relatedEntityId: payload.orderId,
        groupKey: `order:${payload.orderId}`,
        updateExisting: true,
        ongoing: false,
        orderStatus: 'CANCELLED',
        trackingAudience: 'DRIVER',
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

  @OnEvent('order.driver_rejected_notify_driver')
  async handleDriverRejectedNotifyDriver(payload: { orderId: string; driverUserId: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.ORDER_CANCELLED_BY_CUSTOMER,
      title: 'Customer chose another driver',
      body: 'This order is no longer assigned to you.',
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `order:${payload.orderId}`,
      orderStatus: 'SEARCHING_DRIVER',
      updateExisting: true,
      ongoing: false,
      trackingAudience: 'DRIVER',
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
