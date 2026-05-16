import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { splitWithdrawalGross } from './withdrawal-fee.util';



@Injectable()

export class CountryCoinConfigService {

  constructor(private readonly prisma: PrismaService) {}



  /** Active `CountryCoinConfig.coinsPerFiatUnit` (coins per 1.00 local fiat). */

  async getActiveConfig(countryId: string) {

    const now = new Date();

    return this.prisma.countryCoinConfig.findFirst({

      where: {

        countryId,

        isActive: true,

        effectiveFrom: { lte: now },

        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],

      },

      orderBy: { effectiveFrom: 'desc' },

    });

  }



  async getActiveCoinsPerFiatUnit(countryId: string): Promise<number | null> {

    const coinRow = await this.getActiveConfig(countryId);

    if (!coinRow) return null;

    const rate = Number(coinRow.coinsPerFiatUnit);

    return Number.isFinite(rate) && rate > 0 ? rate : null;

  }



  async getActiveWithdrawalFeeBps(countryId: string): Promise<number> {

    const coinRow = await this.getActiveConfig(countryId);

    if (!coinRow) return 0;

    const bps = coinRow.withdrawalFeeBps ?? 0;

    return Number.isFinite(bps) && bps > 0 ? Math.min(10000, Math.floor(bps)) : 0;

  }



  /** User amount = total debited; fee is deducted; net is paid out in fiat. */
  async computeWithdrawalSplit(
    countryId: string,
    grossDebitCoins: number,
  ): Promise<{ grossDebit: number; feeCoins: number; netPayout: number; feeBps: number }> {
    const feeBps = await this.getActiveWithdrawalFeeBps(countryId);
    const split = splitWithdrawalGross(grossDebitCoins, feeBps);
    return { ...split, feeBps };
  }



  fiatToCoins(fiat: number, coinsPerFiatUnit: number | null): number {

    if (!coinsPerFiatUnit || !Number.isFinite(coinsPerFiatUnit) || coinsPerFiatUnit <= 0) {

      return fiat;

    }

    return Math.round(fiat * coinsPerFiatUnit * 100) / 100;

  }



  coinsToFiat(coins: number, coinsPerFiatUnit: number | null): number {

    if (!coinsPerFiatUnit || !Number.isFinite(coinsPerFiatUnit) || coinsPerFiatUnit <= 0) {

      return coins;

    }

    return Math.round((coins / coinsPerFiatUnit) * 100) / 100;

  }

}


