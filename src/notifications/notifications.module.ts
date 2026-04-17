import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import {
  UserNotificationsController,
  SuperUserNotificationsController,
} from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { FirebaseService } from './services/firebase.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderNotificationListener } from './listeners/order-notification.listener';
import { PaymentNotificationListener } from './listeners/payment-notification.listener';
import { AccountNotificationListener } from './listeners/account-notification.listener';
import { SupportNotificationListener } from './listeners/support-notification.listener';
import { ChatNotificationListener } from './listeners/chat-notification.listener';
import { DriverOpportunityListener } from './listeners/driver-opportunity.listener';
import { AdminNotificationListener } from './listeners/admin-notification.listener';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [UserNotificationsController, SuperUserNotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    FirebaseService,
    // Event Listeners
    OrderNotificationListener,
    PaymentNotificationListener,
    AccountNotificationListener,
    SupportNotificationListener,
    ChatNotificationListener,
    DriverOpportunityListener,
    AdminNotificationListener,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
