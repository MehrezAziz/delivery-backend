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
    messagePreview: string;
    messageId: string;
    sentAt: string;
  }) {
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.NEW_MESSAGE_FROM_DRIVER,
      relatedEntityType: 'ChatRoom',
      relatedEntityId: payload.orderId,
      groupKey: `chat:${payload.orderId}`,
      templateData: {
        driverName: payload.driverName,
        messagePreview: payload.messagePreview,
        messageId: payload.messageId,
        sentAt: payload.sentAt,
      },
    });
  }

  @OnEvent('chat.new_message_from_customer')
  async handleMessageFromCustomer(payload: {
    orderId: string;
    driverUserId: string;
    customerName?: string;
    messagePreview: string;
    messageId: string;
    sentAt: string;
  }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.NEW_MESSAGE_FROM_CUSTOMER,
      relatedEntityType: 'ChatRoom',
      relatedEntityId: payload.orderId,
      groupKey: `chat:${payload.orderId}`,
      templateData: {
        customerName: payload.customerName,
        messagePreview: payload.messagePreview,
        messageId: payload.messageId,
        sentAt: payload.sentAt,
      },
    });
  }
}
