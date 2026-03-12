import { Module } from '@nestjs/common';
import { DriversController, AdminDriverController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { VerificationService } from './services/verification.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PrismaModule, DocumentsModule],
  controllers: [DriversController, AdminDriverController],
  providers: [
    DriversService,
    VerificationService,
    AdminApprovalService,
  ],
  exports: [DriversService, VerificationService, AdminApprovalService],
})
export class DriversModule {}
