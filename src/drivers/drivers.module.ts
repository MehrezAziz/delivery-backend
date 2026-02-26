import { Module } from '@nestjs/common';
import { DriversController, AdminDriverController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { VerificationService } from './services/verification.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DriversController, AdminDriverController],
  providers: [
    DriversService,
    VerificationService,
    AdminApprovalService,
  ],
  exports: [VerificationService, AdminApprovalService],
})
export class DriversModule {}
