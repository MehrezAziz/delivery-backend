import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationType,
  NotificationPriority,
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from './services/firebase.service';
import { NotificationsGateway } from './notifications.gateway';
import { CHANNELS_BY_PRIORITY, DEFAULT_PRIORITY } from './constants/notification-config';
import { getNotificationTemplate } from './services/notification-templates';

export interface SendNotificationDto {
  userId: string;
  userType: 'USER' | 'SUPER_USER';
  type: NotificationType;
  title?: string;
  body?: string;
  priority?: NotificationPriority;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionButtons?: Array<{ id: string; title: string; action: string }>;
  groupKey?: string;
  expiresAt?: Date;
  templateData?: Record<string, string | number | undefined>;
  // If true, update existing notification with same groupKey instead of creating new one
  updateExisting?: boolean;
  // If true, the push notification is ongoing/sticky (non-dismissible on Android)
  ongoing?: boolean;
  // Explicit order status to pass to the frontend dedup map (overrides type-based mapping)
  orderStatus?: string;
  /** Mobile app: show driver persistent order tracking UI vs customer */
  trackingAudience?: 'CUSTOMER' | 'DRIVER';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private firebaseService: FirebaseService,
    private gateway: NotificationsGateway,
  ) {}

  async send(dto: SendNotificationDto) {
    try {
      const priority = dto.priority || DEFAULT_PRIORITY[dto.type] || NotificationPriority.MEDIUM;
      const channels = CHANNELS_BY_PRIORITY[priority];

      // Use provided title/body or generate from template
      let title = dto.title;
      let body = dto.body;
      if (!title || !body) {
        const template = getNotificationTemplate(dto.type, dto.templateData);
        title = title || template.title;
        body = body || template.body;
      }

      // Create or update notification record in DB (IN_APP)
      let notificationId: string;

      // If groupKey is provided, always try to update existing notification first
      // This ensures only ONE notification per order/group in the DB
      if (dto.groupKey) {
        const existing = await this.prisma.notification.findFirst({
          where: { userId: dto.userId, groupKey: dto.groupKey },
          orderBy: { sentAt: 'desc' },
        });

        if (existing) {
          await this.prisma.notification.update({
            where: { id: existing.id },
            data: { title, body, type: dto.type, priority, readAt: null, sentAt: new Date() },
          });
          notificationId = existing.id;
        } else {
          notificationId = require('crypto').randomUUID();
          await this.prisma.$executeRaw`
            INSERT INTO notifications (id, user_id, user_type, title, body, type, priority, channels, related_entity_type, related_entity_id, action_buttons, expires_at, group_key, sent_at, delivery_status)
            VALUES (${notificationId}, ${dto.userId}, ${dto.userType}, ${title}, ${body}, ${dto.type}::"NotificationType", ${priority}::"NotificationPriority", ${channels}::"NotificationChannel"[], ${dto.relatedEntityType || null}, ${dto.relatedEntityId || null}, ${dto.actionButtons ? JSON.stringify(dto.actionButtons) : null}::jsonb, ${dto.expiresAt || null}::timestamp, ${dto.groupKey || null}, NOW(), 'SENT'::"NotificationDeliveryStatus")
          `;
        }
      } else {
        // No groupKey — always create new notification
        notificationId = require('crypto').randomUUID();
        await this.prisma.$executeRaw`
          INSERT INTO notifications (id, user_id, user_type, title, body, type, priority, channels, related_entity_type, related_entity_id, action_buttons, expires_at, group_key, sent_at, delivery_status)
          VALUES (${notificationId}, ${dto.userId}, ${dto.userType}, ${title}, ${body}, ${dto.type}::"NotificationType", ${priority}::"NotificationPriority", ${channels}::"NotificationChannel"[], ${dto.relatedEntityType || null}, ${dto.relatedEntityId || null}, ${dto.actionButtons ? JSON.stringify(dto.actionButtons) : null}::jsonb, ${dto.expiresAt || null}::timestamp, ${dto.groupKey || null}, NOW(), 'SENT'::"NotificationDeliveryStatus")
        `;
      }

      const notification = { id: notificationId, sentAt: new Date() };

      // Dispatch to PUSH channel
      if (channels.includes(NotificationChannel.PUSH) && dto.userType === 'USER') {
        await this.sendPush(dto.userId, title, body, notification.id, dto);
      }

      // Dispatch to WEB_SOCKET channel
      if (channels.includes(NotificationChannel.WEB_SOCKET)) {
        this.gateway.sendToUser(dto.userId, {
          id: notification.id,
          title,
          body,
          type: dto.type,
          priority,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
          sentAt: notification.sentAt,
        });
      }

      return notification;
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async sendPush(
    userId: string,
    title: string,
    body: string,
    notificationId: string,
    dto: SendNotificationDto,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true },
      });

      if (!user?.fcmToken) {
        this.logger.warn(`No FCM token for user ${userId}, skipping push`);
        return;
      }

      this.logger.log(`Sending push to user ${userId}, type: ${dto.type}, groupKey: ${dto.groupKey}`);

      // Map notification type to order status so the frontend can update its dedup map
      const ORDER_STATUS_BY_TYPE: Partial<Record<string, string>> = {
        ORDER_CREATED: 'SEARCHING_DRIVER',
        DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
        DRIVER_ARRIVED: 'DRIVER_ARRIVED',
        PACKAGE_PICKED_UP: 'PICKED_UP',
        DELIVERY_IN_PROGRESS: 'DELIVERING',
        ORDER_DELIVERED: 'DELIVERED',
        ORDER_CANCELLED: 'CANCELLED',
        NO_DRIVER_FOUND: 'NO_DRIVER_FOUND',
      };
      const orderStatus = dto.orderStatus || ORDER_STATUS_BY_TYPE[dto.type];

      const result = await this.firebaseService.sendPush({
        token: user.fcmToken,
        title,
        body,
        data: {
          notificationId,
          type: dto.type,
          ...(dto.relatedEntityType ? { relatedEntityType: dto.relatedEntityType } : {}),
          ...(dto.relatedEntityId ? { relatedEntityId: dto.relatedEntityId } : {}),
          // Pass orderId separately for Notifee notification ID
          ...(dto.groupKey?.startsWith('order:') ? { orderId: dto.groupKey.replace('order:', '') } : {}),
          // Pass orderStatus so the frontend dedup map stays in sync
          ...(orderStatus ? { orderStatus } : {}),
          ...(dto.trackingAudience ? { trackingAudience: dto.trackingAudience } : {}),
          // Progress step for the notification progress bar
          progressStep: String(this.getProgressStep(dto.type)),
        },
        actionButtons: dto.actionButtons,
        groupKey: dto.groupKey,
        ongoing: dto.ongoing !== undefined ? dto.ongoing : !!dto.groupKey?.startsWith('order:'),
      });

      if (!result.success) {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: {
            deliveryStatus: NotificationDeliveryStatus.FAILED,
            failureReason: result.error,
          },
        });

        // Clear invalid token
        if (result.error?.startsWith('Invalid token')) {
          await this.prisma.user.update({
            where: { id: userId },
            data: { fcmToken: null, fcmPlatform: null },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Push notification failed for user ${userId}`, error.stack);
    }
  }

  private getProgressStep(type: NotificationType): number {
    const stepMap: Partial<Record<NotificationType, number>> = {
      ORDER_CREATED: 0,       // Searching
      // Step 1 = Driver Found (pending approval) — handled with custom title/body
      DRIVER_ASSIGNED: 2,     // Driver Assigned (approved)
      DRIVER_ARRIVED: 3,      // Driver Arrived
      PACKAGE_PICKED_UP: 4,   // Picked Up
      DELIVERY_IN_PROGRESS: 5, // Delivering
      ORDER_DELIVERED: 6,     // Delivered
    };
    return stepMap[type] ?? -1;
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string, userType: string) {
    return this.prisma.notification.updateMany({
      where: { userId, userType, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async getNotifications(
    userId: string,
    userType: string,
    query: { page?: number; limit?: number; type?: NotificationType; status?: string },
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { userId, userType };
    if (query.type) where.type = query.type;
    if (query.status === 'read') where.readAt = { not: null };
    if (query.status === 'unread') where.readAt = null;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount(userId: string, userType: string) {
    return this.prisma.notification.count({
      where: { userId, userType, readAt: null },
    });
  }

  // Helper: Send to all admins
  async sendToAllAdmins(
    type: NotificationType,
    options: Omit<SendNotificationDto, 'userId' | 'userType' | 'type'> = {},
  ) {
    const admins = await this.prisma.superUser.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });

    const promises = admins.map((admin) =>
      this.send({ ...options, userId: admin.id, userType: 'SUPER_USER', type }),
    );
    await Promise.allSettled(promises);
  }

  // Helper: Send to CS agents with a specific permission
  async sendToCSWithPermission(
    permission: string,
    type: NotificationType,
    options: Omit<SendNotificationDto, 'userId' | 'userType' | 'type'> = {},
  ) {
    const csAgents = await this.prisma.customerService.findMany({
      where: { roles: { has: permission as any } },
      include: { superUser: { select: { id: true, status: true } } },
    });

    const activeAgents = csAgents.filter((cs) => cs.superUser.status === 'ACTIVE');
    const promises = activeAgents.map((cs) =>
      this.send({ ...options, userId: cs.superUser.id, userType: 'SUPER_USER', type }),
    );
    await Promise.allSettled(promises);
  }
}
