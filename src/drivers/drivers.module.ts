import { Module } from '@nestjs/common';
import { DriversController, AdminDriverController } from './drivers.controller';
import { TestDriverController } from './test.controller';
import { DriversService } from './drivers.service';
import { VerificationService } from './services/verification.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { DriverInitializationService } from './services/driver-initialization.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PrismaModule, DocumentsModule],
  controllers: [DriversController, AdminDriverController, TestDriverController],
  providers: [
    DriversService,
    VerificationService,
    AdminApprovalService,
    DriverInitializationService,
  ],
  exports: [DriversService, VerificationService, AdminApprovalService, DriverInitializationService],
})
export class DriversModule {}
