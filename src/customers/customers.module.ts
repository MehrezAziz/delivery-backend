import { Module } from '@nestjs/common';
import { CustomersController, AdminCustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CustomersController, AdminCustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
