import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CoinTransfersService } from './coin-transfers.service';

@Injectable()
export class CoinTransferJobsService {
  private readonly logger = new Logger(CoinTransferJobsService.name);

  constructor(private readonly coinTransfers: CoinTransfersService) {}

  @Cron('*/30 * * * * *')
  async processDueCoinTransfers(): Promise<void> {
    try {
      await this.coinTransfers.processDueTransfers();
    } catch (e) {
      this.logger.error(`processDueCoinTransfers: ${(e as Error).message}`);
    }
  }
}
