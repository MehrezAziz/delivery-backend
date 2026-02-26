import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { DriversModule } from './drivers/drivers.module';
import { OrdersModule } from './orders/orders.module';
import { WalletModule } from './wallet/wallet.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RestrictionModule } from './restrictions/restriction.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    DriversModule,
    OrdersModule,
    WalletModule,
    NotificationsModule,
    RestrictionModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
