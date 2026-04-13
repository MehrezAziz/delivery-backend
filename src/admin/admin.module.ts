import { Module } from '@nestjs/common';
import { GeographyController } from './controllers/geography.controller';
import { PricingController } from './controllers/pricing.controller';
import { CustomerServiceManagementController } from './controllers/customer-service-management.controller';
import { OrderArrivalConflictController } from './controllers/order-arrival-conflict.controller';
import { GeographyService } from './services/geography.service';
import { PricingService } from './services/pricing.service';
import { CustomerServiceManagementService } from './services/customer-service-management.service';
import { OrderArrivalConflictService } from './services/order-arrival-conflict.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    GeographyController,
    PricingController,
    CustomerServiceManagementController,
    OrderArrivalConflictController,
  ],
  providers: [
    GeographyService,
    PricingService,
    CustomerServiceManagementService,
    OrderArrivalConflictService,
  ],
  exports: [
    GeographyService,
    PricingService,
    CustomerServiceManagementService,
  ],
})
export class AdminModule {}
