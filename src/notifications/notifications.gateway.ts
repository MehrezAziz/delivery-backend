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
      try {
        // Try @nestjs/jwt first (for mobile app tokens)
        payload = this.jwtService.verify(token, {
          secret: this.configService.get<string>('JWT_SECRET'),
        });
      } catch (jwtError) {
        // Try jose verification (for control panel tokens signed with jose)
        try {
          const secret = new TextEncoder().encode(this.configService.get<string>('JWT_SECRET'));
          const { payload: josePayload } = await jwtVerify(token, secret);
          payload = josePayload;
        } catch (joseError) {
          this.logger.warn(`JWT verification failed for both methods`);
          client.disconnect();
          return;
        }
      }

      // Store user info on socket — control panel tokens have superUserId, mobile tokens have sub
      client.data.userId = payload.superUserId || payload.sub || payload.id;
      client.data.userType = payload.superUserId ? 'SUPER_USER' : 'USER';

      if (!client.data.userId) {
        this.logger.warn('No userId found in token payload');
        client.disconnect();
        return;
      }

      // Join a room based on user ID for targeted notifications
      client.join(`user:${client.data.userId}`);

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

  // Send notification to all connected clients (broadcast)
  broadcast(notification: any) {
    this.server.emit('notification', notification);
  }
}
