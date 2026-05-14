import { Module } from '@nestjs/common';
import { CoinTransfersService } from './coin-transfers.service';
import { CoinTransfersController } from './coin-transfers.controller';
import { CoinTransfersAdminController } from './coin-transfers-admin.controller';
import { CoinTransferJobsService } from './coin-transfer-jobs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, NotificationsModule, AuthModule],
  controllers: [CoinTransfersController, CoinTransfersAdminController],
  providers: [CoinTransfersService, CoinTransferJobsService],
  exports: [CoinTransfersService],
})
export class CoinTransfersModule {}
