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
  /** Stable thread for Android notification tag + iOS thread-id (chat / order / support grouping). */
  threadId?: string;
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
      const orderId =
        isOrderNotification && payload.groupKey
          ? payload.groupKey.replace(/^order:/, '').split(':')[0]
          : undefined;

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
        // Order notifications must be DATA-ONLY so the app controls a single
        // persistent notification per order (instead of Android creating native ones).
        // IMPORTANT (Android): do not add a top-level `notification` field — when it is
        // present, the OS may not deliver the message to the JS background handler while
        // backgrounded/killed, so Notifee cannot update the ongoing order notification.
        message = {
          token: payload.token,
          // No `notification` field for order updates
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
        const isChatMessageNotification =
          dataPayload.type === 'NEW_MESSAGE_FROM_DRIVER' ||
          dataPayload.type === 'NEW_MESSAGE_FROM_CUSTOMER';
        const threadId =
          payload.threadId ||
          payload.groupKey ||
          (dataPayload.relatedEntityType && dataPayload.relatedEntityId
            ? `${dataPayload.relatedEntityType}:${dataPayload.relatedEntityId}`
            : undefined);
        const androidTag =
          threadId && threadId.length <= 64 ? threadId : threadId?.slice(0, 64);

        // Chat + other non-order pushes: DATA-ONLY on Android so `setBackgroundMessageHandler`
        // runs when the app is backgrounded/killed; the app shows Notifee (chat) / tray logic.
        // iOS still gets a visible alert via `aps.alert` below (no dependency on top-level `notification`).
        message = {
          token: payload.token,
          data: {
            ...dataPayload,
            ...(threadId ? { threadId } : {}),
          },
          android: {
            priority: 'high',
            ...(!isChatMessageNotification && threadId ? { collapseKey: threadId.slice(0, 128) } : {}),
            ...(isChatMessageNotification && androidTag ? { collapseKey: androidTag.slice(0, 128) } : {}),
          },
          apns: {
            headers: {
              'apns-priority': '10',
              'apns-push-type': 'alert',
            },
            payload: {
              aps: {
                alert: {
                  title: payload.title,
                  body: payload.body,
                },
                sound: 'default',
                ...(threadId ? { 'thread-id': threadId } : {}),
              },
            },
          },
        };
      }

      await admin.messaging().send(message);
      this.logger.log(`FCM push sent successfully to token ${payload.token.substring(0, 20)}... (order: ${isOrderNotification}, groupKey: ${payload.groupKey})`);
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

  /** Verify Firebase Auth ID token (e.g. phone auth). */
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.initialized) {
      throw new Error('Firebase Admin not initialized');
    }
    return admin.auth().verifyIdToken(idToken);
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}
