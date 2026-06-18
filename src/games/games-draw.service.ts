import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  Game,
  GameCoinCreditMode,
  GameDrawStatus,
  GamePrizeType,
  GameWinnerSelectionMode,
  GameWinnerStatus,
  GameWinnerPoolMode,
  GamePhysicalPrizeStatus,
  Prisma,
  ReferenceType,
  UserRole,
  WalletTransactionType,
  DriverTransactionType,
  NotificationType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
// getCurrentPeriod is used when endsAt closes an in-progress period early
import {
  getCurrentPeriod,
  getPreviousPeriod,
  GamePeriodBounds,
} from './games-period.util';
import { roleMatchesPool } from './games-eligibility.util';
import { isGameOpenOnDate } from './games-time.util';

type EligibleUser = { userId: string; userRole: UserRole; weight: number };

@Injectable()
export class GamesDrawService {
  private readonly logger = new Logger(GamesDrawService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('* * * * *')
  async processDrawsCron() {
    const games = await this.prisma.game.findMany({
      where: {
        OR: [
          { isActive: true },
          { draws: { some: { status: GameDrawStatus.OPEN } } },
        ],
      },
      include: {
        prizeTiers: { orderBy: { rank: 'asc' } },
      },
    });
    for (const game of games) {
      try {
        await this.processGameDraws(game);
      } catch (e) {
        this.logger.error(`Draw failed for game ${game.id}: ${(e as Error).message}`);
      }
    }
    await this.autoConfirmPending();
  }

  @Cron('0 8 * * *')
  async sendGameRemindersCron() {
    const games = await this.prisma.game.findMany({ where: { isActive: true } });
    for (const game of games) {
      await this.sendRemindersForGame(game.id);
    }
  }

  private async processGameDraws(
    game: Game & {
      prizeTiers: {
        id: string;
        rank: number;
        prizeType: GamePrizeType;
        coinAmount: Prisma.Decimal | null;
        prizeLabel: string | null;
      }[];
    },
  ) {
    const now = new Date();
    const periods = new Map<string, GamePeriodBounds>();
    const prev = getPreviousPeriod(game, now);
    periods.set(prev.periodKey, prev);

    if (game.endsAt && game.endsAt.getTime() <= now.getTime()) {
      const current = getCurrentPeriod(game, now);
      periods.set(current.periodKey, current);
    }

    const scopes =
      game.winnerPoolMode === GameWinnerPoolMode.SEPARATE_BY_ROLE
        ? ['CUSTOMER', 'DRIVER']
        : ['COMBINED'];

    for (const period of periods.values()) {
      const periodEnded = period.periodEnd.getTime() <= now.getTime();
      const current = getCurrentPeriod(game, now);
      const forceEarlyClose =
        !!game.endsAt &&
        game.endsAt.getTime() <= now.getTime() &&
        period.periodKey === current.periodKey;
      if (!periodEnded && !forceEarlyClose) continue;

      for (const poolScope of scopes) {
        let draw = await this.prisma.gameDraw.findFirst({
          where: {
            gameId: game.id,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            poolScope,
          },
        });
        if (!draw) {
          draw = await this.prisma.gameDraw.create({
            data: {
              gameId: game.id,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              poolScope,
              status: GameDrawStatus.OPEN,
            },
          });
        }
        if (draw.status !== GameDrawStatus.OPEN) continue;
        await this.runDrawForScope(game, draw.id, period, poolScope);
      }
    }
  }

  async runDrawForScope(
    game: Game & { prizeTiers: { id: string; rank: number; prizeType: GamePrizeType; coinAmount: Prisma.Decimal | null }[] },
    drawId: string,
    period: GamePeriodBounds,
    poolScope: string,
  ) {
    const eligible = await this.getEligibleParticipants(
      game,
      period.periodStart,
      period.periodEnd,
      poolScope,
    );
    if (eligible.length === 0) {
      await this.prisma.gameDraw.update({
        where: { id: drawId },
        data: { status: GameDrawStatus.CONFIRMED, closedAt: new Date() },
      });
      return;
    }

    const tiers = game.prizeTiers;
    if (tiers.length === 0) {
      this.logger.warn(
        `Draw ${drawId} for game ${game.id} has eligible players but no prize tiers configured`,
      );
      return;
    }
    const picks: EligibleUser[] = [];
    const pool = [...eligible];

    for (const tier of tiers) {
      const pick = this.weightedPick(pool);
      if (!pick) break;
      picks.push(pick);
      pool.splice(
        pool.findIndex((p) => p.userId === pick.userId),
        1,
      );
    }

    const confirmDeadline =
      game.winnerSelectionMode === GameWinnerSelectionMode.RANDOM_CONFIRM
        ? new Date(Date.now() + 12 * 60 * 60 * 1000)
        : null;

    const status =
      game.winnerSelectionMode === GameWinnerSelectionMode.MANUAL
        ? GameDrawStatus.AWAITING_CONFIRM
        : game.winnerSelectionMode === GameWinnerSelectionMode.RANDOM_CONFIRM
          ? GameDrawStatus.AWAITING_CONFIRM
          : GameDrawStatus.CONFIRMED;

    await this.prisma.$transaction(async (tx) => {
      await tx.gameDraw.update({
        where: { id: drawId },
        data: {
          status,
          confirmDeadline,
          closedAt: new Date(),
        },
      });

      for (let i = 0; i < picks.length; i++) {
        const pick = picks[i];
        const tier = tiers[i];
        if (!tier) break;
        const winnerStatus =
          status === GameDrawStatus.CONFIRMED
            ? GameWinnerStatus.CONFIRMED
            : GameWinnerStatus.PENDING_CONFIRM;

        await tx.gameWinner.create({
          data: {
            gameId: game.id,
            drawId,
            userId: pick.userId,
            userRole: pick.userRole,
            prizeTierId: tier.id,
            status: winnerStatus,
            correctCountInPeriod: pick.weight,
            physicalPrizeStatus:
              tier.prizeType === GamePrizeType.PHYSICAL
                ? GamePhysicalPrizeStatus.PENDING_CONTACT
                : null,
            confirmedAt:
              winnerStatus === GameWinnerStatus.CONFIRMED ? new Date() : null,
          },
        });
      }
    });

    if (status === GameDrawStatus.CONFIRMED) {
      await this.finalizeDrawWinners(drawId, game);
    }
  }

  private async getEligibleParticipants(
    game: Game,
    periodStart: Date,
    periodEnd: Date,
    poolScope: string,
  ): Promise<EligibleUser[]> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentWinners = await this.prisma.gameWinner.findMany({
      where: {
        gameId: game.id,
        wonAt: { gte: sixMonthsAgo },
        status: {
          in: [
            GameWinnerStatus.CONFIRMED,
            GameWinnerStatus.PRIZE_CREDITED,
            GameWinnerStatus.PENDING_CONFIRM,
          ],
        },
      },
      select: { userId: true },
    });
    const blocked = new Set(recentWinners.map((w) => w.userId));

    const allAnswers = await this.prisma.gameAnswer.groupBy({
      by: ['userId'],
      where: {
        gameId: game.id,
        answeredAt: { gte: periodStart, lt: periodEnd },
      },
      _count: { _all: true },
    });

    const correctAnswers = await this.prisma.gameAnswer.groupBy({
      by: ['userId'],
      where: {
        gameId: game.id,
        isCorrect: true,
        answeredAt: { gte: periodStart, lt: periodEnd },
      },
      _count: { _all: true },
    });
    const correctByUser = new Map(
      correctAnswers.map((row) => [row.userId, row._count._all]),
    );
    const soleParticipant = allAnswers.length === 1 ? allAnswers[0].userId : null;

    const result: EligibleUser[] = [];
    for (const row of allAnswers) {
      if (blocked.has(row.userId)) continue;

      let weight = correctByUser.get(row.userId) ?? 0;
      if (weight === 0 && row.userId === soleParticipant) {
        weight = 1;
      }
      if (weight === 0) continue;
      const user = await this.prisma.user.findUnique({
        where: { id: row.userId },
        include: {
          customer: true,
          driver: { include: { driverAccount: true } },
        },
      });
      if (!user) continue;

      if (game.requireCompletedOrder) {
        if (user.role === UserRole.CUSTOMER) {
          if (!user.customer || user.customer.completedOrders < 1) continue;
        } else if (user.role === UserRole.DRIVER) {
          if (
            !user.driver?.driverAccount ||
            user.driver.driverAccount.completedDeliveries < 1
          ) {
            continue;
          }
        }
      }

      if (!roleMatchesPool(user.role, poolScope)) continue;
      result.push({
        userId: user.id,
        userRole: user.role,
        weight,
      });
    }
    return result;
  }

  private weightedPick(pool: EligibleUser[]): EligibleUser | null {
    if (pool.length === 0) return null;
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p;
    }
    return pool[pool.length - 1];
  }

  async autoConfirmPending() {
    const overdue = await this.prisma.gameDraw.findMany({
      where: {
        status: GameDrawStatus.AWAITING_CONFIRM,
        confirmDeadline: { lte: new Date() },
      },
      include: { game: { include: { prizeTiers: true } } },
    });
    for (const draw of overdue) {
      await this.prisma.gameDraw.update({
        where: { id: draw.id },
        data: { status: GameDrawStatus.CONFIRMED },
      });
      await this.prisma.gameWinner.updateMany({
        where: { drawId: draw.id, status: GameWinnerStatus.PENDING_CONFIRM },
        data: { status: GameWinnerStatus.CONFIRMED, confirmedAt: new Date() },
      });
      await this.finalizeDrawWinners(draw.id, draw.game);
    }
  }

  async confirmDraw(drawId: string) {
    const draw = await this.prisma.gameDraw.findUnique({
      where: { id: drawId },
      include: { game: { include: { prizeTiers: true } } },
    });
    if (!draw) return;
    await this.prisma.gameDraw.update({
      where: { id: drawId },
      data: { status: GameDrawStatus.CONFIRMED, closedAt: new Date() },
    });
    await this.prisma.gameWinner.updateMany({
      where: { drawId, status: GameWinnerStatus.PENDING_CONFIRM },
      data: { status: GameWinnerStatus.CONFIRMED, confirmedAt: new Date() },
    });
    await this.finalizeDrawWinners(drawId, draw.game);
  }

  async finalizeDrawWinners(drawId: string, game: Game) {
    const winners = await this.prisma.gameWinner.findMany({
      where: { drawId, status: GameWinnerStatus.CONFIRMED },
      include: { prizeTier: true, draw: true },
    });

    for (const w of winners) {
      if (
        w.prizeTier.prizeType === GamePrizeType.COINS &&
        game.coinCreditMode === GameCoinCreditMode.AUTO_ON_CONFIRM
      ) {
        await this.creditCoins(w.userId, w.userRole, Number(w.prizeTier.coinAmount ?? 0), w.id);
        await this.prisma.gameWinner.update({
          where: { id: w.id },
          data: { status: GameWinnerStatus.PRIZE_CREDITED, creditedAt: new Date() },
        });
      }

      const notify = await this.shouldNotifyUser(w.userId, w.userRole);
      if (notify) {
        await this.notifications.send({
          userId: w.userId,
          userType: 'USER',
          type: NotificationType.GAME_WINNER,
          templateData: {
            gameName: game.name,
            prize: w.prizeTier.prizeLabel ?? `${w.prizeTier.coinAmount} coins`,
          },
          relatedEntityType: 'GAME_WINNER',
          relatedEntityId: w.id,
        });
      }
    }

    await this.notifyDrawCompleted(game, drawId);
  }

  private async creditCoins(
    userId: string,
    role: UserRole,
    amount: number,
    winnerId: string,
  ) {
    if (amount <= 0) return;
    if (role === UserRole.CUSTOMER) {
      const customer = await this.prisma.customer.findUnique({
        where: { userId },
        select: { id: true, primaryWalletId: true },
      });
      const wallet = customer?.primaryWalletId
        ? await this.prisma.digitalWallet.findUnique({ where: { id: customer.primaryWalletId } })
        : customer
          ? await this.prisma.digitalWallet.findFirst({
              where: { customerId: customer.id },
              orderBy: { updatedAt: 'asc' },
            })
          : null;
      if (!wallet) return;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.digitalWallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: WalletTransactionType.GAME_PRIZE,
            amount,
            status: 'SUCCESS',
            referenceId: winnerId,
            referenceType: ReferenceType.GAME_PRIZE,
            balanceAfter: updated.balance,
          },
        });
      });
    } else {
      const account = await this.prisma.driverAccount.findFirst({
        where: { driver: { userId } },
      });
      if (!account) return;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.driverAccount.update({
          where: { id: account.id },
          data: { balance: { increment: amount } },
        });
        await tx.driverTransaction.create({
          data: {
            accountId: account.id,
            type: DriverTransactionType.GAME_PRIZE,
            amount,
            referenceId: winnerId,
            referenceType: 'GAME_PRIZE',
            balanceAfter: updated.balance,
          },
        });
      });
    }
  }

  private async shouldNotifyUser(userId: string, role: UserRole): Promise<boolean> {
    if (role === UserRole.CUSTOMER) {
      const c = await this.prisma.customer.findFirst({ where: { userId } });
      return !!c?.notifyGameEvents;
    }
    const d = await this.prisma.driver.findFirst({ where: { userId } });
    return !!d?.notifyGameEvents;
  }

  private async notifyDrawCompleted(game: Game, drawId: string) {
    const participants = await this.prisma.gameAnswer.findMany({
      where: { gameId: game.id },
      distinct: ['userId'],
      select: { userId: true },
    });
    const winnerIds = new Set(
      (
        await this.prisma.gameWinner.findMany({
          where: { drawId },
          select: { userId: true },
        })
      ).map((w) => w.userId),
    );

    for (const p of participants) {
      if (winnerIds.has(p.userId)) continue;
      const user = await this.prisma.user.findUnique({ where: { id: p.userId } });
      if (!user) continue;
      const notify = await this.shouldNotifyUser(p.userId, user.role);
      if (!notify) continue;
      await this.notifications.send({
        userId: p.userId,
        userType: 'USER',
        type: NotificationType.GAME_DRAW_COMPLETED,
        templateData: { gameName: game.name },
        relatedEntityType: 'GAME_DRAW',
        relatedEntityId: drawId,
      });
    }
  }

  private async sendRemindersForGame(gameId: string) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game?.isActive) return;
    if (!isGameOpenOnDate(game.scheduleMode, game.calendarDays, game.weekdays)) {
      return;
    }

    const countryIds = (
      await this.prisma.gameCountry.findMany({
        where: { gameId },
        select: { countryId: true },
      })
    ).map((c) => c.countryId);

    const customers = await this.prisma.customer.findMany({
      where: {
        notifyGameEvents: true,
        customerStatus: { in: ['ACTIVE', 'VERIFIED'] },
        wallets: { some: { countryId: { in: countryIds } } },
      },
      select: { userId: true },
    });
    const drivers = await this.prisma.driver.findMany({
      where: { notifyGameEvents: true, status: 'VERIFIED' },
      select: { userId: true },
    });

    const userIds = [...customers.map((c) => c.userId), ...drivers.map((d) => d.userId)];
    for (const userId of userIds) {
      await this.notifications.send({
        userId,
        userType: 'USER',
        type: NotificationType.GAME_REMINDER,
        templateData: { gameName: game.name },
        relatedEntityType: 'GAME',
        relatedEntityId: gameId,
      });
    }
  }

  static async hashAccessCode(code: string): Promise<string> {
    return bcrypt.hash(code, 10);
  }

  static async verifyAccessCode(code: string, hash: string): Promise<boolean> {
    return bcrypt.compare(code, hash);
  }
}
