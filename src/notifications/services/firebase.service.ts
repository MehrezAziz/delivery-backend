import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  actionButtons?: Array<{ id: string; title: string; action: string }>;
  groupKey?: string;
  ongoing?: boolean; // For persistent Android notifications
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private initialized = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn('Firebase credentials not configured. Push notifications disabled.');
        return;
      }

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
      }

      this.initialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
    }
  }

  async sendPush(payload: PushPayload): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized) {
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const isOrderNotification = payload.groupKey?.startsWith('order:');
      const orderId = isOrderNotification && payload.groupKey ? payload.groupKey.replace('order:', '') : undefined;

      const dataPayload: Record<string, string> = {
        ...payload.data,
        ...(payload.groupKey ? { groupKey: payload.groupKey } : {}),
        ...(orderId ? { orderId } : {}),
        ...(payload.actionButtons ? { actionButtons: JSON.stringify(payload.actionButtons) } : {}),
        ongoing: payload.ongoing ? 'true' : 'false',
        title: payload.title,
        body: payload.body,
      };

      // For order notifications, use a stable tag so Android replaces the notification
      const tag = isOrderNotification && orderId ? `order_${orderId}` : undefined;

      let message: admin.messaging.Message;

      if (isOrderNotification) {
        // Order notifications: DATA-ONLY message
        // The foreground service on the client handles display
        message = {
          token: payload.token,
          // No notification field — data only so the foreground service handles it
          data: dataPayload,
          android: {
            priority: 'high',
          },
          apns: {
            headers: {
              'apns-priority': '10',
              'apns-push-type': 'background',
              ...(tag ? { 'apns-collapse-id': tag } : {}),
            },
            payload: {
              aps: {
                'content-available': 1,
                ...(payload.groupKey ? { 'thread-id': payload.groupKey } : {}),
              },
            },
          },
        };
      } else {
        // Non-order notifications: standard notification display
        message = {
          token: payload.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: dataPayload,
          android: {
            priority: 'high',
            notification: {
              channelId: 'default',
              sound: 'default',
            },
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: {
              aps: { sound: 'default' },
            },
          },
        };
      }

      await admin.messaging().send(message);
      return { success: true };
    } catch (error: any) {
      const errorCode = error?.code || error?.errorInfo?.code || '';
      if (
        errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/registration-token-not-registered'
      ) {
        return { success: false, error: `Invalid token: ${errorCode}` };
      }
      this.logger.error(`FCM send failed: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}
