import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SecuritySessionService } from './security-session.service';
import { OtpService } from './otp.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferralModule } from '../referral/referral.module';
import { DriversModule } from '../drivers/drivers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailService } from './mail.service';
import { WhatsappOtpService } from './whatsapp-otp.service';
import { JwtUserStrategy } from './strategies/jwt-user.strategy';
import { JwtSuperUserStrategy } from './strategies/jwt-superuser.strategy';
import {
  JwtUserGuard,
  JwtSuperUserGuard,
  CustomerGuard,
  DriverGuard,
  CustomerOrDriverGuard,
  AdminGuard,
  CustomerServiceGuard,
  StaffGuard,
  UserActiveGuard,
  UserRestrictionGuard,
  VerifiedDriverGuard,
} from './guards/auth.guards';

@Module({
  imports: [
    PrismaModule,
    ReferralModule,
    DriversModule,
    NotificationsModule,
    PassportModule,
    ConfigModule,
    // JWT Module
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') as string,
        signOptions: {
          expiresIn: '30d',
        },
      }),
    }),
    // Redis Module for OTP storage
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: `redis://${configService.get<string>('REDIS_HOST')}:${configService.get<number>('REDIS_PORT')}`,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    SecuritySessionService,
    AuthService,
    OtpService,
    MailService,
    WhatsappOtpService,
    JwtUserStrategy,
    JwtSuperUserStrategy,
    // Guards
    JwtUserGuard,
    JwtSuperUserGuard,
    CustomerGuard,
    DriverGuard,
    CustomerOrDriverGuard,
    AdminGuard,
    CustomerServiceGuard,
    StaffGuard,
    UserActiveGuard,
    UserRestrictionGuard,
    VerifiedDriverGuard,
  ],
  exports: [
    SecuritySessionService,
    AuthService,
    OtpService,
    JwtUserGuard,
    JwtSuperUserGuard,
    CustomerGuard,
    DriverGuard,
    CustomerOrDriverGuard,
    AdminGuard,
    CustomerServiceGuard,
    StaffGuard,
    UserActiveGuard,
    UserRestrictionGuard,
    VerifiedDriverGuard,
  ],
})
export class AuthModule {}
