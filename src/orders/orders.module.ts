import { Module } from '@nestjs/common';
import { OrdersController, DriverOrdersController, AdminOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PriceCalculationService } from './services/price-calculation.service';
import { DriverAssignmentService } from './services/driver-assignment.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OrdersController, DriverOrdersController, AdminOrdersController],
  providers: [
    OrdersService,
    PriceCalculationService,
    DriverAssignmentService,
  ],
  exports: [OrdersService, PriceCalculationService, DriverAssignmentService],
})
export class OrdersModule {}
