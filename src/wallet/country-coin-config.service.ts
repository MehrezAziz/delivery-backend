import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CountryCoinConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active `CountryCoinConfig.coinsPerFiatUnit` (coins per 1.00 local fiat). */
  async getActiveCoinsPerFiatUnit(countryId: string): Promise<number | null> {
    const now = new Date();
    const coinRow = await this.prisma.countryCoinConfig.findFirst({
      where: {
        countryId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!coinRow) return null;
    const rate = Number(coinRow.coinsPerFiatUnit);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
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
