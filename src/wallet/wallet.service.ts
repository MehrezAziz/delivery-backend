import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FiatPayoutMethod, ResponseType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWithdrawalRequestDto } from './dto/wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a DigitalWallet for a newly registered customer.
   * Called automatically on customer registration when status is ACTIVE.
   */
  async createWalletForCustomer(
    customerId: string,
    countryId: string,
    tx?: any,
  ) {
    const db = tx ?? this.prisma;
    return db.digitalWallet.create({
      data: {
        customerId,
        countryId,
        balance: 0,
        currency: 'TND',
        discount: 0,
      },
    });
  }

  /**
   * Get the wallet of the authenticated customer.
   */
  async getMyWallet(userId: string) {
    const wallet = await this.prisma.digitalWallet.findFirst({
      where: { customer: { userId } },
      select: {
        id: true,
        customerId: true,
        countryId: true,
        balance: true,
        lockedForTransfers: true,
        currency: true,
        discount: true,
        updatedAt: true,
        country: {
          select: { currencyCode: true, currencySymbol: true, name: true },
        },
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const balanceCoins = Number(wallet.balance);
    const lockedCoins = Number(wallet.lockedForTransfers ?? 0);
    const spendableCoins =
      Math.round((balanceCoins - lockedCoins) * 100) / 100;

    const now = new Date();
    const coinRow = await this.prisma.countryCoinConfig.findFirst({
      where: {
        countryId: wallet.countryId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const rate = coinRow ? Number(coinRow.coinsPerFiatUnit) : NaN;
    let coinsToLocalFiat: {
      coinsPerFiatUnit: number;
      currencyCode: string;
      currencySymbol: string;
      balanceAsLocalFiat: number;
      spendableAsLocalFiat: number;
    } | null = null;
    if (Number.isFinite(rate) && rate > 0) {
      coinsToLocalFiat = {
        coinsPerFiatUnit: rate,
        currencyCode: wallet.country.currencyCode,
        currencySymbol: wallet.country.currencySymbol,
        balanceAsLocalFiat: Math.round((balanceCoins / rate) * 100) / 100,
        spendableAsLocalFiat: Math.round((spendableCoins / rate) * 100) / 100,
      };
    }

    return {
      id: wallet.id,
      customerId: wallet.customerId,
      countryId: wallet.countryId,
      balance: balanceCoins,
      lockedForTransfers: lockedCoins,
      spendable: spendableCoins,
      discount: Number(wallet.discount),
      currency: wallet.currency,
      updatedAt: wallet.updatedAt,
      /** Wallet balance is denominated in platform coins (not fiat labels). */
      balanceUnit: 'COINS' as const,
      /** Optional: estimated local fiat equivalent using active `CountryCoinConfig.coinsPerFiatUnit` (coins per 1.00 fiat unit). */
      coinsToLocalFiat,
    };
  }

  /**
   * Get transaction history for the authenticated customer.
   */
  async getMyTransactions(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const wallet = await this.findWalletByUserId(userId);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          walletId: true,
          orderId: true,
          type: true,
          amount: true,
          status: true,
          referenceId: true,
          referenceType: true,
          balanceAfter: true,
          createdAt: true,
        },
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get withdrawal request history for the authenticated customer.
   */
  async getMyWithdrawalRequests(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const wallet = await this.findWalletByUserId(userId);
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where: { walletId: wallet.id },
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          walletId: true,
          amount: true,
          status: true,
          payoutMethod: true,
          payoutBankHolderName: true,
          payoutBankName: true,
          payoutBankAccountRef: true,
          descriptionOfCustomer: true,
          descriptionOfAdmin: true,
          requestedAt: true,
          processedAt: true,
        },
      }),
      this.prisma.withdrawalRequest.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      requests: requests.map((r) => ({
        ...r,
        amount: Number(r.amount),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updatePayoutBankDetails(userId: string, dto: { accountHolderName: string; bankName: string; accountReference: string }) {
    const h = dto.accountHolderName.trim();
    const b = dto.bankName.trim();
    const r = dto.accountReference.trim();
    if (!h || !b || !r) {
      throw new BadRequestException('All bank fields are required');
    }
    return this.prisma.userPayoutBankDetails.upsert({
      where: { userId },
      create: {
        userId,
        accountHolderName: h,
        bankName: b,
        accountReference: r,
      },
      update: {
        accountHolderName: h,
        bankName: b,
        accountReference: r,
      },
      select: {
        accountHolderName: true,
        bankName: true,
        accountReference: true,
        updatedAt: true,
      },
    });
  }

  async deletePayoutBankDetails(userId: string) {
    await this.prisma.userPayoutBankDetails.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async cancelWithdrawalRequest(userId: string, requestId: string) {
    const wallet = await this.findWalletByUserId(userId);
    const row = await this.prisma.withdrawalRequest.findFirst({
      where: { id: requestId, walletId: wallet.id },
    });
    if (!row) {
      throw new NotFoundException('Withdrawal request not found');
    }
    if (row.status !== ResponseType.PENDING) {
      throw new BadRequestException('Only pending withdrawal requests can be cancelled');
    }
    await this.prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: ResponseType.REJECTED,
        processedAt: new Date(),
        descriptionOfAdmin: 'Cancelled by customer',
      },
    });
    return { ok: true };
  }

  /** Saved bank details for payout (profile); customer-only. */
  async getPayoutBankDetails(userId: string) {
    const row = await this.prisma.userPayoutBankDetails.findUnique({
      where: { userId },
      select: {
        accountHolderName: true,
        bankName: true,
        accountReference: true,
        updatedAt: true,
      },
    });
    return row ?? null;
  }

  /**
   * Submit a withdrawal request.
   */
  async createWithdrawalRequest(
    userId: string,
    dto: CreateWithdrawalRequestDto,
  ) {
    const wallet = await this.findWalletByUserId(userId);
    const bal = Number(wallet.balance);
    const locked = Number(wallet.lockedForTransfers ?? 0);
    const spendable = Math.round((bal - locked) * 100) / 100;
    if (dto.amount > spendable) {
      throw new BadRequestException('Amount cannot exceed your available wallet balance');
    }
    if (dto.amount <= 0 || spendable <= 0) {
      throw new BadRequestException('Invalid amount or zero balance');
    }

    const payoutMethod =
      dto.payoutMethod === 'CASH' ? FiatPayoutMethod.CASH : FiatPayoutMethod.BANK_TRANSFER;

    assertBankFieldsForTransfer(payoutMethod, dto);

    const bankHolder =
      payoutMethod === FiatPayoutMethod.BANK_TRANSFER
        ? dto.payoutBankHolderName!.trim()
        : null;
    const bankName =
      payoutMethod === FiatPayoutMethod.BANK_TRANSFER ? dto.payoutBankName!.trim() : null;
    const bankRef =
      payoutMethod === FiatPayoutMethod.BANK_TRANSFER
        ? dto.payoutBankAccountRef!.trim()
        : null;

    const request = await this.prisma.withdrawalRequest.create({
      data: {
        walletId: wallet.id,
        amount: dto.amount,
        payoutMethod,
        payoutBankHolderName: bankHolder,
        payoutBankName: bankName,
        payoutBankAccountRef: bankRef,
        descriptionOfCustomer: dto.descriptionOfCustomer,
      },
    });

    const customer = await this.prisma.customer.findUnique({
      where: { id: wallet.customerId },
      select: { userId: true },
    });
    const customerUserId = customer?.userId;

    if (
      payoutMethod === FiatPayoutMethod.BANK_TRANSFER &&
      dto.saveBankDetailsToProfile &&
      customerUserId
    ) {
      await this.prisma.userPayoutBankDetails.upsert({
        where: { userId: customerUserId },
        create: {
          userId: customerUserId,
          accountHolderName: bankHolder!,
          bankName: bankName!,
          accountReference: bankRef!,
        },
        update: {
          accountHolderName: bankHolder!,
          bankName: bankName!,
          accountReference: bankRef!,
        },
      });
    }
    if (customerUserId) {
      this.eventEmitter.emit('withdrawal.status_changed', {
        userId: customerUserId,
        status: 'PENDING',
      });
    }
    this.eventEmitter.emit('admin.fiat_withdrawal_requested', {
      source: 'customer' as const,
      requestId: request.id,
      amount: String(dto.amount),
      currency: wallet.currency,
      payoutMethod: String(payoutMethod),
    });

    return {
      ...request,
      amount: Number(request.amount),
    };
  }

  // ─── Internal helper ───────────────────────────────────────────────────────

  private async findWalletByUserId(userId: string) {
    const wallet = await this.prisma.digitalWallet.findFirst({
      where: { customer: { userId } },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }
}

function assertBankFieldsForTransfer(
  method: FiatPayoutMethod,
  dto: Pick<
    CreateWithdrawalRequestDto,
    'payoutBankHolderName' | 'payoutBankName' | 'payoutBankAccountRef'
  >,
) {
  if (method !== FiatPayoutMethod.BANK_TRANSFER) return;
  const h = dto.payoutBankHolderName?.trim();
  const b = dto.payoutBankName?.trim();
  const r = dto.payoutBankAccountRef?.trim();
  if (!h || !b || !r) {
    throw new BadRequestException(
      'Bank transfer requires account holder name, bank name, and account reference (IBAN/RIB/account number).',
    );
  }
}
