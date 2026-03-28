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
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Store user info on socket
      client.data.userId = payload.superUserId || payload.sub;
      client.data.userType = payload.superUserId ? 'SUPER_USER' : 'USER';

      // Join a room based on user ID for targeted notifications
      client.join(`user:${client.data.userId}`);

      this.logger.log(`Client connected: ${client.data.userId} (${client.data.userType})`);
    } catch (error) {
      this.logger.warn(`Unauthorized WebSocket connection attempt`);
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
