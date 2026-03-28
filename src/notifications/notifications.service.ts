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

      // Create notification record in DB (IN_APP)
      // Use raw SQL to avoid dual FK constraint issue (both user and superUser relations share userId column)
      const notificationId = require('crypto').randomUUID();
      await this.prisma.$executeRaw`
        INSERT INTO notifications (id, user_id, user_type, title, body, type, priority, channels, related_entity_type, related_entity_id, action_buttons, expires_at, group_key, sent_at, delivery_status)
        VALUES (${notificationId}, ${dto.userId}, ${dto.userType}, ${title}, ${body}, ${dto.type}::"NotificationType", ${priority}::"NotificationPriority", ${channels}::"NotificationChannel"[], ${dto.relatedEntityType || null}, ${dto.relatedEntityId || null}, ${dto.actionButtons ? JSON.stringify(dto.actionButtons) : null}::jsonb, ${dto.expiresAt || null}::timestamp, ${dto.groupKey || null}, NOW(), 'SENT'::"NotificationDeliveryStatus")
      `;

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

      if (!user?.fcmToken) return;

      const result = await this.firebaseService.sendPush({
        token: user.fcmToken,
        title,
        body,
        data: {
          notificationId,
          type: dto.type,
          ...(dto.relatedEntityType ? { relatedEntityType: dto.relatedEntityType } : {}),
          ...(dto.relatedEntityId ? { relatedEntityId: dto.relatedEntityId } : {}),
        },
        actionButtons: dto.actionButtons,
        groupKey: dto.groupKey,
        ongoing: !!dto.groupKey?.startsWith('order:'),
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
