import { Module } from '@nestjs/common';
import { DriversController, AdminDriverController } from './drivers.controller';
import { TestDriverController } from './test.controller';
import { DriversService } from './drivers.service';
import { VerificationService } from './services/verification.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { DriverInitializationService } from './services/driver-initialization.service';
import { AvailabilityService } from './services/availability.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule,
    DocumentsModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [DriversController, AdminDriverController, TestDriverController],
  providers: [
    DriversService,
    VerificationService,
    AdminApprovalService,
    DriverInitializationService,
    AvailabilityService,
  ],
  exports: [DriversService, VerificationService, AdminApprovalService, DriverInitializationService, AvailabilityService],
})
export class DriversModule {}
