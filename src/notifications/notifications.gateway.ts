import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import { CustomerServiceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('No token provided');
        client.disconnect();
        return;
      }

      let payload: any;
      const secretStr = this.configService.get<string>('JWT_SECRET');
      try {
        // Control panel (delivery-control) signs with jose — try that first
        const secret = new TextEncoder().encode(secretStr);
        const { payload: josePayload } = await jwtVerify(token, secret);
        payload = josePayload;
      } catch (joseError) {
        try {
          payload = this.jwtService.verify(token, {
            secret: secretStr,
          });
        } catch (jwtError) {
          try {
            const fallback = new TextEncoder().encode('fallback-secret');
            const { payload: fallbackPayload } = await jwtVerify(token, fallback);
            payload = fallbackPayload;
          } catch {
            this.logger.warn(`JWT verification failed for all methods`);
            client.disconnect();
            return;
          }
        }
      }

      // Store user info on socket
      // - control panel tokens have `superUserId`
      // - mobile/user tokens typically have `sub` or `id`
      // - delivery-company portal tokens are shaped around `companyId` + `departmentId` / `departmentAccountId`
      client.data.userId =
        payload.superUserId ||
        payload.sub ||
        payload.id ||
        payload.departmentAccountId ||
        payload.departmentId ||
        payload.companyId;
      client.data.userType = payload.superUserId ? 'SUPER_USER' : 'USER';
      client.data.superUserId = payload.superUserId ? String(payload.superUserId) : null;

      if (!client.data.userId) {
        this.logger.warn('No userId found in token payload');
        client.disconnect();
        return;
      }

      // Join rooms for targeted notifications.
      // Company portal tokens may carry both `departmentAccountId` and `departmentId`.
      // Dispatchers might send to either scope; joining both prevents silent drops.
      const joinIds = new Set<string>();
      if (payload.superUserId) joinIds.add(String(payload.superUserId));
      if (payload.sub) joinIds.add(String(payload.sub));
      if (payload.id) joinIds.add(String(payload.id));
      if (payload.departmentAccountId) joinIds.add(String(payload.departmentAccountId));
      if (payload.departmentId) joinIds.add(String(payload.departmentId));
      if (payload.companyId) joinIds.add(String(payload.companyId));

      for (const id of joinIds) {
        client.join(`user:${id}`);
      }

      this.logger.log(`Client connected: ${client.data.userId} (${client.data.userType})`);
    } catch (error) {
      this.logger.warn(`Unauthorized WebSocket connection attempt: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.userId) {
      this.logger.log(`Client disconnected: ${client.data.userId}`);
    }
  }

  // Send notification to a specific user
  sendToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  /** Lightweight chat refresh for company portal (no inbox row / no unread badge). */
  emitOrderChatRefresh(userIds: string[], orderId: string) {
    const uniq = [...new Set(userIds.filter(Boolean))];
    for (const uid of uniq) {
      this.server.to(`user:${uid}`).emit('order_chat_refresh', { orderId });
    }
  }

  /** Lightweight order status refresh for company portal order views. */
  emitOrderUpdated(userIds: string[], orderId: string, status?: string) {
    const uniq = [...new Set(userIds.filter(Boolean))];
    for (const uid of uniq) {
      this.server.to(`user:${uid}`).emit('order_updated', { orderId, status: status ?? null });
    }
  }

  /** Staff viewing a support ticket in delivery-control — instant refresh without HTTP polling. */
  emitSupportTicketThreadUpdate(ticketId: string) {
    this.server.to(`support_ticket:${ticketId}`).emit('support_ticket_thread', { ticketId });
  }

  private async assertCanSubscribeSupportTicket(superUserId: string, ticketId: string): Promise<boolean> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { assignedTo: true },
    });
    if (!ticket) return false;

    const su = await this.prisma.superUser.findUnique({
      where: { id: superUserId },
      select: {
        admin: { select: { id: true } },
        customerService: { select: { id: true, roles: true } },
      },
    });
    if (!su) return false;
    if (su.admin) return true;
    if (!su.customerService) return false;
    const roles = su.customerService.roles ?? [];
    if (!roles.includes(CustomerServiceRole.MANAGE_SUPPORT_TICKETS)) return false;
    if (!ticket.assignedTo) return true;
    return ticket.assignedTo === su.customerService.id;
  }

  @SubscribeMessage('subscribe_support_ticket')
  async handleSubscribeSupportTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody() ticketId: unknown,
  ) {
    const id = typeof ticketId === 'string' ? ticketId : null;
    if (!id) return { ok: false, error: 'ticketId required' };
    const superUserId = client.data.superUserId ? String(client.data.superUserId) : String(client.data.userId);
    const ok = await this.assertCanSubscribeSupportTicket(superUserId, id);
    if (!ok) return { ok: false, error: 'forbidden' };
    await client.join(`support_ticket:${id}`);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe_support_ticket')
  async handleUnsubscribeSupportTicket(
    @ConnectedSocket() client: Socket,
    @MessageBody() ticketId: unknown,
  ) {
    const id = typeof ticketId === 'string' ? ticketId : null;
    if (!id) return { ok: false };
    await client.leave(`support_ticket:${id}`);
    return { ok: true };
  }

  // Send notification to all connected clients (broadcast)
  broadcast(notification: any) {
    this.server.emit('notification', notification);
  }
}
