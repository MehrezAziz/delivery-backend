import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWithdrawalRequestDto } from './dto/wallet.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

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
        balance: true,
        currency: true,
        discount: true,
        updatedAt: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      ...wallet,
      balance: Number(wallet.balance),
      discount: Number(wallet.discount),
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

  /**
   * Submit a withdrawal request.
   */
  async createWithdrawalRequest(
    userId: string,
    dto: CreateWithdrawalRequestDto,
  ) {
    const wallet = await this.findWalletByUserId(userId);

    if (Number(wallet.balance) < dto.amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const request = await this.prisma.withdrawalRequest.create({
      data: {
        walletId: wallet.id,
        amount: dto.amount,
        descriptionOfCustomer: dto.descriptionOfCustomer,
      },
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
