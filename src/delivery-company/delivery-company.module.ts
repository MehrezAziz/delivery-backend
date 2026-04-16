import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminDeliveryCompanyController, DeliveryCompanyController } from './delivery-company.controller';
import { DeliveryCompanyService } from './delivery-company.service';
import { DeliveryCompanyApiKeyGuard } from './delivery-company-auth.guard';

@Module({
  imports: [PrismaModule, OrdersModule, NotificationsModule],
  controllers: [AdminDeliveryCompanyController, DeliveryCompanyController],
  providers: [DeliveryCompanyService, DeliveryCompanyApiKeyGuard],
  exports: [DeliveryCompanyService],
})
export class DeliveryCompanyModule {}
