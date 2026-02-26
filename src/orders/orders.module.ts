import { Module } from '@nestjs/common';
import { OrdersController, DriverOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PriceCalculationService } from './services/price-calculation.service';
import { DriverAssignmentService } from './services/driver-assignment.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OrdersController, DriverOrdersController],
  providers: [
    OrdersService,
    PriceCalculationService,
    DriverAssignmentService,
  ],
  exports: [OrdersService, PriceCalculationService, DriverAssignmentService],
})
export class OrdersModule {}
