import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GameButtonPlacement,
  GameDrawStatus,
  GameWinnerStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamesDrawService } from './games-draw.service';
import {
  isCustomerEligibleStatus,
  isDriverEligibleStatus,
  EligibilityReason,
} from './games-eligibility.util';
import {
  addDaysToDateKey,
  isGameOpenOnDate,
  tunisiaDateKey,
  tunisiaDayStartUtc,
} from './games-time.util';
import { getCurrentPeriod } from './games-period.util';

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drawService: GamesDrawService,
  ) {}

  async getEntriesForPlacement(userId: string, role: UserRole, placement: string) {
    const games = await this.prisma.game.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        countries: true,
        prizeTiers: { orderBy: { rank: 'asc' }, take: 1 },
      },
    });

    const placementField =
      role === UserRole.CUSTOMER ? 'customerButtonPlacement' : 'driverButtonPlacement';

    const filtered = games.filter((g) => g[placementField] === placement);
    return Promise.all(
      filtered.map((g) => this.mapEntryCard(g, userId, role)),
    );
  }

  private async mapEntryCard(
    game: {
      id: string;
      name: string;
      description: string | null;
      isActive: boolean;
      scheduleMode: string;
      calendarDays: number[];
      weekdays: number[];
      bannerImageUrls: string[];
      countries: { countryId: string }[];
      endsAt?: Date | null;
    },
    userId: string,
    role: UserRole,
  ) {
    const eligibility = await this.checkEligibility(userId, role, game.id);
    const openToday = isGameOpenOnDate(
      game.scheduleMode,
      game.calendarDays,
      game.weekdays,
    );
    const hasEnded = !!game.endsAt && game.endsAt.getTime() <= Date.now();
    let status: 'COMING_SOON' | 'OPEN' | 'CLOSED_TODAY' = 'COMING_SOON';
    if (game.isActive && !hasEnded) {
      status = openToday ? 'OPEN' : 'CLOSED_TODAY';
    }
    return {
      id: game.id,
      name: game.name,
      description: game.description,
      bannerImageUrls: game.bannerImageUrls,
      status,
      eligibility,
      canEnter: eligibility === 'OK' && game.isActive,
    };
  }

  async getGameDetail(gameId: string, userId: string, role: UserRole) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        prizeTiers: { orderBy: { rank: 'asc' } },
        countries: { include: { country: true } },
        _count: { select: { questions: { where: { isActive: true } } } },
      },
    });
    if (!game) throw new NotFoundException('Game not found');

    const eligibility = await this.checkEligibility(userId, role, gameId);
    const access = await this.prisma.gameAccess.findUnique({
      where: { gameId_userId: { gameId, userId } },
    });
    const unlocked =
      !!access && access.accessCodeVersion === game.accessCodeVersion;
    const dateKey = tunisiaDateKey();
    const answeredToday = await this.prisma.gameAnswer.count({
      where: { gameId, userId, tunisiaDateKey: dateKey },
    });
    const correctToday = await this.prisma.gameAnswer.count({
      where: { gameId, userId, tunisiaDateKey: dateKey, isCorrect: true },
    });
    const period = getCurrentPeriod(game);
    const correctInPeriod = await this.prisma.gameAnswer.count({
      where: {
        gameId,
        userId,
        isCorrect: true,
        answeredAt: { gte: period.periodStart, lt: period.periodEnd },
      },
    });

    const openToday = isGameOpenOnDate(
      game.scheduleMode,
      game.calendarDays,
      game.weekdays,
    );
    const hasEnded = !!game.endsAt && game.endsAt.getTime() <= Date.now();

    const winners = game.showRecentWinners
      ? await this.getRecentWinners(gameId)
      : [];

    const lowQuestionPool =
      game._count.questions < game.questionsPerDay;

    const nextDayResetUtc = tunisiaDayStartUtc(addDaysToDateKey(dateKey, 1));
    const remainingToday = Math.max(0, game.questionsPerDay - answeredToday);
    const completedToday = unlocked && remainingToday === 0 && answeredToday > 0;

    return {
      id: game.id,
      name: game.name,
      description: game.description,
      bannerImageUrls: game.bannerImageUrls,
      isActive: game.isActive,
      endsAt: game.endsAt ?? null,
      status: !game.isActive || hasEnded
        ? 'COMING_SOON'
        : openToday
          ? 'OPEN'
          : 'CLOSED_TODAY',
      eligibility,
      unlocked,
      questionsPerDay: game.questionsPerDay,
      answeredToday,
      correctToday,
      correctInPeriod,
      remainingToday,
      completedToday,
      nextDayResetUtc,
      periodEnd: period.periodEnd,
      participationCertificate:
        correctInPeriod > 0
          ? {
              message: `You are entered in the draw for this period (${correctInPeriod} correct answer${correctInPeriod === 1 ? '' : 's'} so far).`,
              periodEnd: period.periodEnd,
            }
          : null,
      prizeTiers: game.prizeTiers.map((t) => ({
        rank: t.rank,
        prizeType: t.prizeType,
        coinAmount: t.coinAmount ? Number(t.coinAmount) : null,
        prizeLabel: t.prizeLabel,
        prizeImageUrl: t.prizeImageUrl,
      })),
      recentWinners: winners,
      lowQuestionPoolWarning: lowQuestionPool,
    };
  }

  async unlockCode(gameId: string, userId: string, code: string) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    if (!game.isActive) throw new BadRequestException('Game is not active');

    const attempt = await this.prisma.gameCodeAttempt.upsert({
      where: { gameId_userId: { gameId, userId } },
      create: { gameId, userId, failedAttempts: 0 },
      update: {},
    });

    if (attempt.lockedUntil && attempt.lockedUntil > new Date()) {
      const mins = Math.ceil(
        (attempt.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Too many attempts. Try again in ${mins} minute(s).`,
      );
    }

    const valid = await GamesDrawService.verifyAccessCode(
      code,
      game.accessCodeHash,
    );
    if (!valid) {
      const failed = attempt.failedAttempts + 1;
      const lockedUntil =
        failed >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null;
      await this.prisma.gameCodeAttempt.update({
        where: { gameId_userId: { gameId, userId } },
        data: {
          failedAttempts: lockedUntil ? 0 : failed,
          lockedUntil,
        },
      });
      throw new BadRequestException('Invalid code');
    }

    await this.prisma.gameCodeAttempt.update({
      where: { gameId_userId: { gameId, userId } },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    await this.prisma.gameAccess.upsert({
      where: { gameId_userId: { gameId, userId } },
      create: {
        gameId,
        userId,
        accessCodeVersion: game.accessCodeVersion,
      },
      update: { accessCodeVersion: game.accessCodeVersion, unlockedAt: new Date() },
    });

    return { unlocked: true };
  }

  async getNextQuestion(gameId: string, userId: string) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');

    await this.assertCanPlay(gameId, userId, game);

    const dateKey = tunisiaDateKey();
    const answeredToday = await this.prisma.gameAnswer.count({
      where: { gameId, userId, tunisiaDateKey: dateKey },
    });
    if (answeredToday >= game.questionsPerDay) {
      throw new BadRequestException('Daily question limit reached');
    }

    const shownToday = await this.prisma.gameDailyQuestionShown.findMany({
      where: { gameId, userId, tunisiaDateKey: dateKey },
      select: { questionId: true },
    });
    const excludeIds = shownToday.map((s) => s.questionId);

    const where = {
      gameId,
      isActive: true,
      category: { isActive: true },
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    };
    const total = await this.prisma.gameQuestion.count({ where });
    if (total === 0) {
      throw new BadRequestException(
        'No more questions available today. Check back tomorrow!',
      );
    }
    const question = await this.prisma.gameQuestion.findFirst({
      where,
      include: {
        category: true,
        options: { orderBy: { sortOrder: 'asc' } },
      },
      skip: Math.floor(Math.random() * total),
    });

    if (!question) {
      throw new BadRequestException(
        'No more questions available today. Check back tomorrow!',
      );
    }

    await this.prisma.gameDailyQuestionShown.create({
      data: { gameId, userId, questionId: question.id, tunisiaDateKey: dateKey },
    });

    const shuffled = [...question.options].sort(() => Math.random() - 0.5);

    return {
      questionId: question.id,
      text: question.text,
      imageUrl: question.imageUrl,
      categoryName: question.category.name,
      options: shuffled.map((o) => ({
        id: o.id,
        text: o.text,
        imageUrl: o.imageUrl,
      })),
      progress: {
        answeredToday,
        limit: game.questionsPerDay,
      },
    };
  }

  async submitAnswer(
    gameId: string,
    userId: string,
    questionId: string,
    optionId: string,
  ) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    await this.assertCanPlay(gameId, userId, game);

    const option = await this.prisma.gameQuestionOption.findFirst({
      where: { id: optionId, questionId },
      include: { question: true },
    });
    if (!option || option.question.gameId !== gameId) {
      throw new BadRequestException('Invalid question or option');
    }

    const dateKey = tunisiaDateKey();
    const existing = await this.prisma.gameAnswer.findFirst({
      where: { gameId, userId, questionId, tunisiaDateKey: dateKey },
    });
    if (existing) {
      throw new BadRequestException('You already answered this question today');
    }

    const answer = await this.prisma.gameAnswer.create({
      data: {
        gameId,
        userId,
        questionId,
        selectedOptionId: optionId,
        isCorrect: option.isCorrect,
        tunisiaDateKey: dateKey,
      },
    });

    const answeredToday = await this.prisma.gameAnswer.count({
      where: { gameId, userId, tunisiaDateKey: dateKey },
    });
    const correctToday = await this.prisma.gameAnswer.count({
      where: { gameId, userId, tunisiaDateKey: dateKey, isCorrect: true },
    });

    return {
      isCorrect: answer.isCorrect,
      answeredToday,
      correctToday,
      remainingToday: Math.max(0, game.questionsPerDay - answeredToday),
    };
  }

  async getRecentWinners(gameId: string, limit = 10) {
    const winners = await this.prisma.gameWinner.findMany({
      where: {
        gameId,
        status: {
          in: [GameWinnerStatus.CONFIRMED, GameWinnerStatus.PRIZE_CREDITED],
        },
      },
      include: {
        prizeTier: true,
        draw: true,
      },
      orderBy: { wonAt: 'desc' },
      take: limit,
    });

    const result: Array<{
      displayName: string;
      prizeLabel: string;
      prizeImageUrl: string | null;
      wonAt: Date;
      periodEnd: Date;
    }> = [];
    for (const w of winners) {
      const user = await this.prisma.user.findUnique({
        where: { id: w.userId },
        select: { firstName: true, secondName: true },
      });
      const first = user?.firstName?.trim() || 'Winner';
      const initial = user?.secondName?.trim()?.[0] ?? '';
      result.push({
        displayName: `${first}${initial ? ` ${initial}.` : ''}`,
        prizeLabel:
          w.prizeTier.prizeLabel ??
          (w.prizeTier.coinAmount
            ? `${Number(w.prizeTier.coinAmount)} coins`
            : 'Prize'),
        prizeImageUrl: w.prizeTier.prizeImageUrl,
        wonAt: w.wonAt,
        periodEnd: w.draw.periodEnd,
      });
    }
    return result;
  }

  async getPendingCongrats(userId: string) {
    const winner = await this.prisma.gameWinner.findFirst({
      where: {
        userId,
        congratsShownAt: null,
        status: {
          in: [GameWinnerStatus.CONFIRMED, GameWinnerStatus.PRIZE_CREDITED],
        },
      },
      include: {
        prizeTier: true,
        game: true,
      },
      orderBy: { wonAt: 'desc' },
    });
    if (!winner) return null;
    return {
      winnerId: winner.id,
      gameId: winner.gameId,
      gameName: winner.game.name,
      prizeLabel:
        winner.prizeTier.prizeLabel ??
        (winner.prizeTier.coinAmount
          ? `${Number(winner.prizeTier.coinAmount)} coins`
          : 'Prize'),
      congratsImageUrl: winner.prizeTier.congratsImageUrl,
      prizeImageUrl: winner.prizeTier.prizeImageUrl,
      prizeType: winner.prizeTier.prizeType,
      physicalPrizeStatus: winner.physicalPrizeStatus,
      wonAt: winner.wonAt,
      announcedAt: winner.confirmedAt ?? winner.wonAt,
    };
  }

  async markCongratsShown(userId: string, winnerId: string) {
    const winner = await this.prisma.gameWinner.findFirst({
      where: { id: winnerId, userId },
    });
    if (!winner) throw new NotFoundException('Winner record not found');
    await this.prisma.gameWinner.update({
      where: { id: winnerId },
      data: { congratsShownAt: new Date() },
    });
    return { ok: true };
  }

  private async assertCanPlay(
    gameId: string,
    userId: string,
    game: {
      isActive: boolean;
      accessCodeVersion: number;
      scheduleMode: string;
      calendarDays: number[];
      weekdays: number[];
      endsAt?: Date | null;
      requireCompletedOrder?: boolean;
    },
  ) {
    if (!game.isActive) throw new BadRequestException('Game is not active');
    if (game.endsAt && game.endsAt.getTime() <= Date.now()) {
      throw new BadRequestException('This game has ended');
    }
    if (
      !isGameOpenOnDate(game.scheduleMode, game.calendarDays, game.weekdays)
    ) {
      throw new BadRequestException('Game is not open today');
    }
    const access = await this.prisma.gameAccess.findUnique({
      where: { gameId_userId: { gameId, userId } },
    });
    if (!access || access.accessCodeVersion !== game.accessCodeVersion) {
      throw new ForbiddenException('Enter the access code first');
    }
    if (game.requireCompletedOrder) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          customer: { select: { completedOrders: true } },
          driver: { select: { id: true } },
        },
      });
      if (user?.role === UserRole.CUSTOMER) {
        if (!user.customer || user.customer.completedOrders < 1) {
          throw new ForbiddenException('Complete at least one order to play');
        }
      } else if (user?.role === UserRole.DRIVER) {
        const account = user.driver
          ? await this.prisma.driverAccount.findUnique({
              where: { driverId: user.driver.id },
            })
          : null;
        if (!account || account.completedDeliveries < 1) {
          throw new ForbiddenException('Complete at least one delivery to play');
        }
      }
    }
  }

  async checkEligibility(
    userId: string,
    role: UserRole,
    gameId: string,
  ): Promise<EligibilityReason> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { countries: true },
    });
    if (!game) return 'COMING_SOON';
    if (!game.isActive) return 'COMING_SOON';
    if (game.endsAt && game.endsAt.getTime() <= Date.now()) return 'COMING_SOON';

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: { select: { id: true, customerStatus: true, completedOrders: true, primaryWalletId: true } },
        driver: true,
        addresses: {
          take: 1,
          include: {
            delegation: { include: { governorate: { include: { country: true } } } },
          },
        },
      },
    });
    if (!user?.phone?.trim()) return 'PHONE_REQUIRED';

    if (role === UserRole.CUSTOMER) {
      if (!user.customer || !isCustomerEligibleStatus(user.customer.customerStatus)) {
        return 'NOT_ACTIVE_USER';
      }
      const primaryWallet = user.customer.primaryWalletId
        ? await this.prisma.digitalWallet.findUnique({ where: { id: user.customer.primaryWalletId } })
        : await this.prisma.digitalWallet.findFirst({
            where: { customerId: user.customer.id },
            orderBy: { updatedAt: 'asc' },
          });
      const countryId = primaryWallet?.countryId;
      if (!countryId || !game.countries.some((c) => c.countryId === countryId)) {
        return 'COUNTRY_NOT_ELIGIBLE';
      }
      if (game.requireCompletedOrder && user.customer.completedOrders < 1) {
        return 'ORDER_REQUIRED';
      }
    } else {
      if (!user.driver || !isDriverEligibleStatus(user.driver.status)) {
        return 'NOT_ACTIVE_USER';
      }
      const countryId =
        user.addresses[0]?.delegation?.governorate?.country?.id;
      if (!countryId || !game.countries.some((c) => c.countryId === countryId)) {
        return 'COUNTRY_NOT_ELIGIBLE';
      }
      if (game.requireCompletedOrder) {
        const account = await this.prisma.driverAccount.findUnique({
          where: { driverId: user.driver.id },
        });
        if (!account || account.completedDeliveries < 1) {
          return 'ORDER_REQUIRED';
        }
      }
    }

    const access = await this.prisma.gameAccess.findUnique({
      where: { gameId_userId: { gameId, userId } },
    });
    if (!access) return 'CODE_REQUIRED';
    if (access.accessCodeVersion !== game.accessCodeVersion) {
      return 'CODE_VERSION_STALE';
    }
    return 'OK';
  }
}
