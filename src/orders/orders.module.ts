import { Module } from '@nestjs/common';
import { OrdersController, DriverOrdersController, AdminOrdersController, PublicTrackingController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PriceCalculationService } from './services/price-calculation.service';
import { DriverAssignmentService } from './services/driver-assignment.service';
import { AutoCancelService } from './services/auto-cancel.service';
import { OrderUrgentNotifyService } from './services/order-urgent-notify.service';
import { ScheduledOrderPublishService } from './services/scheduled-order-publish.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [OrdersController, DriverOrdersController, AdminOrdersController, PublicTrackingController],
  providers: [
    OrdersService,
    PriceCalculationService,
    DriverAssignmentService,
    AutoCancelService,
    OrderUrgentNotifyService,
    ScheduledOrderPublishService,
  ],
  exports: [OrdersService, PriceCalculationService, DriverAssignmentService],
})
export class OrdersModule {}
