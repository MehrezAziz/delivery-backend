import { Injectable, Logger } from '@nestjs/common';
import {
  Notification,
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
  /** Also emit the same WebSocket payload to these user rooms (e.g. company root + department inbox). */
  socketMirrorUserIds?: string[];
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

      // Only update an existing grouped notification when explicitly requested.
      // This keeps order timeline notifications collapsed, while chat/support can accumulate unread rows.
      if (dto.groupKey && dto.updateExisting) {
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
        // Create a new notification row (with or without groupKey)
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
        const wsPayload = {
          id: notification.id,
          title,
          body,
          type: dto.type,
          priority,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
          sentAt: notification.sentAt,
        };
        this.gateway.sendToUser(dto.userId, wsPayload);
        const autoMirrors = await this.resolveOrderMirrorUserIds(dto.relatedEntityType, dto.relatedEntityId);
        const mirrors = [...(dto.socketMirrorUserIds ?? []), ...autoMirrors]
          .filter((id) => id && id !== dto.userId)
          .filter((id, index, arr) => arr.indexOf(id) === index);
        for (const uid of mirrors) {
          this.gateway.sendToUser(uid, wsPayload);
        }
      }

      return notification;
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async resolveOrderMirrorUserIds(relatedEntityType?: string, relatedEntityId?: string): Promise<string[]> {
    if (relatedEntityType !== 'Order' || !relatedEntityId) return [];
    const order = await this.prisma.order.findUnique({
      where: { id: relatedEntityId },
      select: {
        sourceType: true,
        deliveryCompanyId: true,
        deliveryCompanyDepartmentId: true,
      },
    });
    if (!order || String(order.sourceType) !== 'DELIVERY_COMPANY') return [];
    return [order.deliveryCompanyId, order.deliveryCompanyDepartmentId].filter(Boolean) as string[];
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

      const threadId =
        dto.groupKey?.trim() ||
        (dto.relatedEntityType && dto.relatedEntityId
          ? `${dto.relatedEntityType}:${dto.relatedEntityId}`
          : `singleton:${notificationId}`);

      const result = await this.firebaseService.sendPush({
        token: user.fcmToken,
        title,
        body,
        threadId,
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

  /** Mark every unread row in the same inbox thread (matches mobile grouping / preview `groupKey`). */
  async markThreadAsRead(userId: string, userType: string, groupKeyRaw: string) {
    const key = (groupKeyRaw || '').trim();
    if (!key) return { count: 0 };
    const now = new Date();

    if (key.startsWith('singleton:')) {
      const id = key.slice('singleton:'.length);
      return this.prisma.notification.updateMany({
        where: { id, userId, userType, readAt: null },
        data: { readAt: now },
      });
    }

    const colonIdx = key.indexOf(':');
    const isPrefixedThread =
      colonIdx > 0 &&
      ['order', 'chat', 'support', 'dispute'].includes(key.slice(0, colonIdx).toLowerCase());

    const orBranches: Array<{ groupKey: string } | { relatedEntityType: string; relatedEntityId: string }> = [
      { groupKey: key },
    ];
    if (!isPrefixedThread && colonIdx > 0) {
      const relatedEntityType = key.slice(0, colonIdx);
      const relatedEntityId = key.slice(colonIdx + 1);
      if (relatedEntityType && relatedEntityId) {
        orBranches.push({ relatedEntityType, relatedEntityId });
      }
    }

    return this.prisma.notification.updateMany({
      where: {
        userId,
        userType,
        readAt: null,
        OR: orBranches as any,
      },
      data: { readAt: now },
    });
  }

  async getNotifications(
    userId: string,
    userType: string,
    query: {
      page?: number;
      limit?: number;
      type?: NotificationType;
      status?: string;
      sortBy?: 'sentAt' | 'type';
    },
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { userId, userType };
    if (query.type) where.type = query.type;
    if (query.status === 'read') where.readAt = { not: null };
    if (query.status === 'unread') where.readAt = null;

    const sortBy = query.sortBy || 'sentAt';
    const orderBy =
      sortBy === 'type'
        ? [{ type: 'asc' as const }, { sentAt: 'desc' as const }]
        : [{ sentAt: 'desc' as const }];

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy,
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

  /** Stable inbox key: DB groupKey, else related entity, else one row per id. */
  static inboxGroupKey(n: Notification): string {
    if (n.groupKey?.trim()) return n.groupKey.trim();
    if (n.relatedEntityType && n.relatedEntityId) {
      return `${n.relatedEntityType}:${n.relatedEntityId}`;
    }
    return `singleton:${n.id}`;
  }

  groupNotificationsIntoRows(notifications: Notification[]) {
    const map = new Map<string, Notification[]>();
    for (const n of notifications) {
      const key = NotificationsService.inboxGroupKey(n);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    const rows: {
      groupKey: string;
      latest: Notification;
      unreadCount: number;
      itemCount: number;
    }[] = [];
    for (const [groupKey, items] of map.entries()) {
      items.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      const latest = items[0];
      const unreadCount = items.filter((x) => !x.readAt).length;
      rows.push({ groupKey, latest, unreadCount, itemCount: items.length });
    }
    return rows;
  }

  async getPreviewGroups(userId: string, userType: string, limitGroups = 8) {
    const recent = await this.prisma.notification.findMany({
      where: { userId, userType },
      orderBy: { sentAt: 'desc' },
      take: 250,
    });
    const allRows = this.groupNotificationsIntoRows(recent);
    allRows.sort((a, b) => {
      const ur = (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
      if (ur !== 0) return ur;
      return b.latest.sentAt.getTime() - a.latest.sentAt.getTime();
    });
    const data = allRows.slice(0, Math.min(20, Math.max(1, limitGroups)));
    return {
      data,
      meta: { limit: data.length, totalGroups: allRows.length },
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

  /** CS agents assigned to this governorate (any role set on the CS row). */
  async sendToCustomerServiceForGovernorate(
    governorateId: string,
    type: NotificationType,
    options: Omit<SendNotificationDto, 'userId' | 'userType' | 'type'> = {},
  ) {
    let agents = await this.prisma.customerService.findMany({
      where: {
        governorates: { some: { governorateId } },
        superUser: { status: 'ACTIVE' },
      },
      include: { superUser: { select: { id: true } } },
    });
    // Safety fallback: if no governorate assignment exists yet, notify all active CS
    // so critical incidents (e.g. reject-after-arrival) are never dropped.
    if (agents.length === 0) {
      agents = await this.prisma.customerService.findMany({
        where: { superUser: { status: 'ACTIVE' } },
        include: { superUser: { select: { id: true } } },
      });
    }
    await Promise.allSettled(
      agents.map((cs) =>
        this.send({ ...options, userId: cs.superUser.id, userType: 'SUPER_USER', type }),
      ),
    );
  }

  /**
   * CS agents with a permission and at least one matching governorate assignment.
   * If governorateIds is empty, falls back to all CS with the permission (no geographic assignment on file).
   */
  async sendToCsWithPermissionForGovernorates(
    governorateIds: string[],
    permission: string,
    type: NotificationType,
    options: Omit<SendNotificationDto, 'userId' | 'userType' | 'type'> = {},
  ) {
    if (!governorateIds.length) {
      return this.sendToCSWithPermission(permission, type, options);
    }
    const agents = await this.prisma.customerService.findMany({
      where: {
        roles: { has: permission as any },
        governorates: { some: { governorateId: { in: governorateIds } } },
        superUser: { status: 'ACTIVE' },
      },
      include: { superUser: { select: { id: true } } },
    });
    await Promise.allSettled(
      agents.map((cs) =>
        this.send({ ...options, userId: cs.superUser.id, userType: 'SUPER_USER', type }),
      ),
    );
  }

  async getGovernorateIdsForUser(userId: string): Promise<string[]> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      select: { delegation: { select: { governorateId: true } } },
      take: 10,
    });
    return [...new Set(addresses.map((a) => a.delegation.governorateId))];
  }

  /**
   * Resolve governorates for a support ticket.
   * Priority:
   * 1) If ticket description references an order id ("Order #<uuid>"), use pickup/dropoff governorates of that order.
   * 2) Fallback to the ticket owner's address governorates.
   */
  async getGovernorateIdsForSupportTicket(ticketId: string, userId: string): Promise<string[]> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { description: true },
    });
    if (!ticket) return this.getGovernorateIdsForUser(userId);

    const orderIdMatch = ticket.description?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const orderId = orderIdMatch?.[0];
    if (orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          pickupAddress: { select: { delegation: { select: { governorateId: true } } } },
          dropoffAddress: { select: { delegation: { select: { governorateId: true } } } },
        },
      });
      const fromOrder = [
        order?.pickupAddress?.delegation?.governorateId,
        order?.dropoffAddress?.delegation?.governorateId,
      ].filter((v): v is string => !!v);
      if (fromOrder.length) return [...new Set(fromOrder)];
    }

    return this.getGovernorateIdsForUser(userId);
  }
}
