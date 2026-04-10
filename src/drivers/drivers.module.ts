import { Module } from '@nestjs/common';
import { DriversController, AdminDriverController, StaffDriverController } from './drivers.controller';
import { TestDriverController } from './test.controller';
import { DriversService } from './drivers.service';
import { VerificationService } from './services/verification.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { DriverInitializationService } from './services/driver-initialization.service';
import { MlVerificationService } from './services/ml-verification.service';
import { AvailabilityService } from './services/availability.service';
import { IdentityVerificationService } from './services/identity-verification.service';
import { VerificationRulesService } from './services/verification-rules.service';
import { LivenessChallengeService } from './services/liveness-challenge.service';
import { TranslationService } from './services/translation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';

@Module({
  imports: [
    PrismaModule,
    DocumentsModule,
    ConfigModule,
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: `redis://${configService.get<string>('REDIS_HOST')}:${configService.get<number>('REDIS_PORT')}`,
      }),
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [DriversController, AdminDriverController, StaffDriverController, TestDriverController],
  providers: [
    DriversService,
    VerificationService,
    AdminApprovalService,
    DriverInitializationService,
    AvailabilityService,
    MlVerificationService,
    IdentityVerificationService,
    VerificationRulesService,
    LivenessChallengeService,
    TranslationService,
  ],
  exports: [
    DriversService,
    VerificationService,
    AdminApprovalService,
    DriverInitializationService,
    AvailabilityService,
    MlVerificationService,
    IdentityVerificationService,
  ],
})
export class DriversModule {}
