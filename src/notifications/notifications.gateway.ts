import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';

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

  // Send notification to all connected clients (broadcast)
  broadcast(notification: any) {
    this.server.emit('notification', notification);
  }
}
