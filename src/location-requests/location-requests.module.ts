import { Module } from '@nestjs/common';
import { LocationRequestsService } from './location-requests.service';
import { LocationRequestsController } from './location-requests.controller';
import { LocationRequestsJobsService } from './location-requests-jobs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GeographyModule } from '../geography/geography.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, NotificationsModule, GeographyModule, UsersModule, AuthModule],
  controllers: [LocationRequestsController],
  providers: [LocationRequestsService, LocationRequestsJobsService],
  exports: [LocationRequestsService],
})
export class LocationRequestsModule {}
