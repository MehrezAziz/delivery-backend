import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CoinTopupController, FlouciWebhookController } from './coin-topup.controller';
import { FlouciLandingController } from './flouci-landing.controller';
import { CoinTopupService } from './coin-topup.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [CoinTopupController, FlouciWebhookController, FlouciLandingController],
  providers: [CoinTopupService],
})
export class CoinTopupModule {}
