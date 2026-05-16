import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { CountryCoinConfigService } from './country-coin-config.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WalletController],
  providers: [WalletService, CountryCoinConfigService],
  exports: [WalletService, CountryCoinConfigService],
})
export class WalletModule {}
