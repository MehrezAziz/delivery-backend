import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class ChatNotificationListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('chat.new_message_from_driver')
  async handleMessageFromDriver(payload: {
    orderId: string;
    customerUserId: string;
    driverName?: string;
  }) {
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.NEW_MESSAGE_FROM_DRIVER,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `chat:${payload.orderId}`,
      templateData: { driverName: payload.driverName },
    });
  }

  @OnEvent('chat.new_message_from_customer')
  async handleMessageFromCustomer(payload: {
    orderId: string;
    driverUserId: string;
    customerName?: string;
  }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.NEW_MESSAGE_FROM_CUSTOMER,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      groupKey: `chat:${payload.orderId}`,
      templateData: { customerName: payload.customerName },
    });
  }
}
