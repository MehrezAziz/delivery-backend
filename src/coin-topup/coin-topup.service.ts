import { randomUUID } from 'crypto';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CoinTopupSessionStatus,
  CoinTopupPayerRole,
  TransactionStatus,
  WalletTransactionType,
  DriverTransactionType,
  ReferenceType,
  UserRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { VerifyFlouciTopUpDto } from './dto/coin-topup.dto';

type ResolvedCoinContext = {
  payerRole: CoinTopupPayerRole;
  countryId: string;
  currencyCode: string;
  currencySymbol: string;
  coinsPerFiatUnit: number;
};

type WalletLookup = { walletId?: string; countryId?: string };

/** Flouci Tunisian amount is in millimes (1.000 TND = 1000 millimes). */
function toTndMillimes(fiatMajor: number): number {
  if (!Number.isFinite(fiatMajor) || fiatMajor <= 0) return 0;
  const m = Math.round(fiatMajor * 1000);
  return m < 1 ? 1 : m;
}

function extractPaymentId(body: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    body.payment_id,
    body.paymentId,
    body.id,
    (body.payment as Record<string, unknown> | undefined)?.id,
    (body.data as Record<string, unknown> | undefined)?.payment_id,
    (body.result as Record<string, unknown> | undefined)?.payment_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

@Injectable()
export class CoinTopupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async getQuote(userId: string, role: UserRole, lookup?: WalletLookup) {
    const ctx = await this.resolveContext(userId, role, lookup);

    const minCoins = this.config.get<number>('COIN_TOPUP_MIN_COINS', 50);
    const maxCoins = this.config.get<number>('COIN_TOPUP_SLIDER_MAX_COINS', 5_000);
    const stepCoins = this.config.get<number>('COIN_TOPUP_STEP_COINS', 1);

    const auth = this.flouciAuthorization();
    const flouciReady = ctx.currencyCode === 'TND' && !!auth;
    let flouciNote: string | null = null;
    if (ctx.currencyCode !== 'TND') {
      flouciNote =
        'Card top-up via Flouci is enabled for Tunisia (TND) wallets. Your price is still shown in your wallet currency.';
    } else if (!auth) {
      flouciNote =
        'Flouci keys are missing on the server — configure FLOUCI_APP_PUBLIC_KEY and FLOUCI_APP_SECRET to enable checkout.';
    }

    return {
      coinsPerFiatUnit: ctx.coinsPerFiatUnit,
      currencyCode: ctx.currencyCode,
      currencySymbol: ctx.currencySymbol,
      countryId: ctx.countryId,
      minCoins,
      maxCoins,
      stepCoins,
      presets: [
        { coins: 500, label: 'Starter', sub: 'Light top-up' },
        { coins: 2000, label: 'Popular', badge: 'Most chosen', sub: 'Great for regular use' },
        { coins: 7500, label: 'Pro', sub: 'Best for power users' },
      ],
      flouciReady,
      flouciNote,
    };
  }

  async initFlouciSession(
    userId: string,
    role: UserRole,
    rawCoinsAmount: number,
    lookup?: WalletLookup,
  ) {
    const ctx = await this.resolveContext(userId, role, lookup);
    if (ctx.currencyCode !== 'TND') {
      throw new BadRequestException(
        'Coin purchase by card via Flouci is only available for Tunisia (TND) wallets.',
      );
    }
    const auth = this.flouciAuthorization();
    if (!auth) {
      throw new ServiceUnavailableException(
        'Flouci is not configured. Set FLOUCI_APP_PUBLIC_KEY and FLOUCI_APP_SECRET.',
      );
    }

    const minCoins = this.config.get<number>('COIN_TOPUP_MIN_COINS', 50);
    let coinsAmt = Number(rawCoinsAmount);
    if (!Number.isFinite(coinsAmt)) throw new BadRequestException('coinsAmount required');
    coinsAmt = Math.round(coinsAmt * 100) / 100;
    if (coinsAmt < minCoins) {
      throw new BadRequestException(`coinsAmount must be at least ${minCoins}`);
    }

    const rate = ctx.coinsPerFiatUnit;
    const fiatMajor = coinsAmt / rate;
    const amountMillimes = toTndMillimes(fiatMajor);
    const fiatStored = Math.round((amountMillimes / 1000) * 1_000_000) / 1_000_000;

    if (amountMillimes < 1) {
      throw new BadRequestException('Quoted payment amount too small.');
    }

    const origin = this.backendPublicOrigin();
    const successUrlTpl =
      this.config.get<string>('FLOUCI_SUCCESS_URL') ??
      `${origin}/api/payments/flouci/landing/success`;
    const failUrlTpl =
      this.config.get<string>('FLOUCI_FAIL_URL') ?? `${origin}/api/payments/flouci/landing/failure`;
    const webhookBaseTpl =
      this.config.get<string>('FLOUCI_WEBHOOK_URL') ?? `${origin}/api/payments/flouci/webhook`;

    const webhookSecret = (this.config.get<string>('FLOUCI_WEBHOOK_SECRET') ?? '').trim();

    function withSecret(url: string, secret?: string): string {
      const s = secret && secret.length ? secret.trim() : '';
      if (!s) return url;
      return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(s)}`;
    }

    const webhookFull = withSecret(webhookBaseTpl, webhookSecret);

    const trackingId = randomUUID();
    const fiatLabel = (amountMillimes / 1000).toFixed(3);
    const trackingQs = `tracking=${encodeURIComponent(trackingId)}&amount=${encodeURIComponent(fiatLabel)}`;
    const successLink = `${successUrlTpl}${successUrlTpl.includes('?') ? '&' : '?'}${trackingQs}`;
    const failLink = `${failUrlTpl}${failUrlTpl.includes('?') ? '&' : '?'}${trackingQs}`;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, phone: true },
    });
    const clientId =
      `${user?.firstName?.trim?.() ?? 'User'} (${user?.phone ?? userId.slice(0, 6)})`.slice(0, 120);

    const session = await this.prisma.coinTopupSession.create({
      data: {
        userId,
        payerRole: ctx.payerRole,
        countryId: ctx.countryId,
        coinsAmount: coinsAmt,
        fiatAmount: fiatStored,
        fiatCurrencyCode: 'TND',
        amountMillimes,
        coinsPerFiatUnit: rate,
        developerTrackingId: trackingId,
        status: CoinTopupSessionStatus.PENDING,
      },
      select: { id: true, developerTrackingId: true },
    });

    const generateUrl =
      this.config.get<string>('FLOUCI_GENERATE_URL') ??
      'https://developers.flouci.com/api/v2/generate_payment';

    let respJson: Record<string, unknown>;
    try {
      const resp = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount: String(amountMillimes),
          developer_tracking_id: trackingId,
          accept_card: true,
          success_link: successLink,
          fail_link: failLink,
          webhook: webhookFull,
          client_id: clientId,
        }),
      });
      respJson = (await resp.json()) as Record<string, unknown>;
    } catch {
      await this.prisma.coinTopupSession.update({
        where: { id: session.id },
        data: { status: CoinTopupSessionStatus.FAILED },
      });
      throw new ServiceUnavailableException('Could not reach Flouci');
    }

    const result = respJson.result as Record<string, unknown> | undefined;
    const outerOk =
      result?.success === true &&
      typeof result.payment_id === 'string' &&
      typeof result.link === 'string';

    if (!outerOk) {
      await this.prisma.coinTopupSession.update({
        where: { id: session.id },
        data: { status: CoinTopupSessionStatus.FAILED },
      });
      const msg =
        (result?.message as string | undefined) || JSON.stringify(respJson).slice(0, 280);
      throw new BadRequestException(`Flouci did not create a payment session (${msg}).`);
    }

    const checkoutUrl = String(result.link);
    await this.prisma.coinTopupSession.update({
      where: { id: session.id },
      data: { flouciPaymentId: String(result.payment_id), checkoutUrl },
    });

    return {
      trackingId: session.developerTrackingId,
      paymentId: String(result.payment_id),
      checkoutUrl,
      amountMillimes,
      fiatTotalTnd: Math.round(amountMillimes) / 1000,
      coinsQuoted: coinsAmt,
      currencySymbol: ctx.currencySymbol,
    };
  }

  async verifyOwnedSession(userId: string, dto: VerifyFlouciTopUpDto) {
    const paymentId = dto.paymentId?.trim();
    const trackingId = dto.trackingId?.trim();
    if (!paymentId && !trackingId) {
      throw new BadRequestException('paymentId or trackingId required');
    }

    let session =
      paymentId?.length ?
        await this.prisma.coinTopupSession.findFirst({
          where: { userId, flouciPaymentId: paymentId },
        })
      : null;
    if (!session && trackingId?.length) {
      session = await this.prisma.coinTopupSession.findFirst({
        where: { userId, developerTrackingId: trackingId },
      });
    }
    if (!session) throw new NotFoundException('Top-up session not found');

    const pid =
      paymentId?.length ?
        paymentId
      : session.flouciPaymentId;
    if (!pid) {
      return {
        status: session.status,
        trackingId: session.developerTrackingId,
        message: 'Waiting for Flouci payment id…',
      };
    }

    const { fulfilled } = await this.confirmAndFulfillFromFlouci(pid);
    const fresh = await this.prisma.coinTopupSession.findUnique({
      where: { id: session.id },
    });
    if (!fresh) throw new NotFoundException('Top-up session not found');
    return {
      fulfilled,
      status: fresh.status,
      trackingId: fresh.developerTrackingId,
      coins: Number(fresh.coinsAmount),
    };
  }

  /** User dismisses an unpaid checkout — marks session FAILED (not deleted for audit). */
  async cancelPendingSession(userId: string, trackingId: string) {
    const id = trackingId.trim();
    if (!id) throw new BadRequestException('trackingId required');
    const session = await this.prisma.coinTopupSession.findFirst({
      where: { userId, developerTrackingId: id, status: CoinTopupSessionStatus.PENDING },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Pending payment not found');
    await this.safeMarkFailed(session.id);
    return { ok: true, trackingId: id };
  }

  async listPendingSessionsForUser(userId: string) {
    const rows = await this.prisma.coinTopupSession.findMany({
      where: { userId, status: CoinTopupSessionStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        developerTrackingId: true,
        flouciPaymentId: true,
        checkoutUrl: true,
        coinsAmount: true,
        fiatAmount: true,
        fiatCurrencyCode: true,
        amountMillimes: true,
        createdAt: true,
      },
    });
    return rows.map((s) => ({
      trackingId: s.developerTrackingId,
      paymentId: s.flouciPaymentId,
      checkoutUrl: s.checkoutUrl,
      coins: Number(s.coinsAmount),
      fiatTotal: Number(s.fiatAmount),
      currencyCode: s.fiatCurrencyCode,
      amountMillimes: s.amountMillimes,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async getSessionSummaryForUser(userId: string, trackingId: string) {
    const s = await this.prisma.coinTopupSession.findFirst({
      where: { developerTrackingId: trackingId.trim(), userId },
      select: {
        status: true,
        coinsAmount: true,
        fiatAmount: true,
        fiatCurrencyCode: true,
        amountMillimes: true,
      },
    });
    if (!s) throw new NotFoundException('Session not found');
    return {
      status: s.status,
      coins: Number(s.coinsAmount),
      fiatTotal: Number(s.fiatAmount),
      currencyCode: s.fiatCurrencyCode,
      amountMillimes: s.amountMillimes,
    };
  }

  async handleWebhookBody(body: Record<string, unknown>) {
    const paymentId = extractPaymentId(body);
    if (!paymentId) return { ok: true, noop: true };
    await this.confirmAndFulfillFromFlouci(paymentId);
    return { ok: true };
  }

  private async confirmAndFulfillFromFlouci(paymentId: string): Promise<{
    fulfilled: boolean;
    reason?: string;
  }> {
    const auth = this.flouciAuthorization();
    if (!auth) return { fulfilled: false, reason: 'flouci_unconfigured' };

    const verifyRoot =
      this.config.get<string>('FLOUCI_VERIFY_ROOT') ??
      'https://developers.flouci.com/api/v2/verify_payment';

    let res: Record<string, unknown>;
    try {
      const r = await fetch(
        `${verifyRoot.replace(/\/$/, '')}/${encodeURIComponent(paymentId)}`,
        {
          headers: { Authorization: auth, Accept: 'application/json' },
        },
      );
      res = (await r.json()) as Record<string, unknown>;
    } catch {
      return { fulfilled: false, reason: 'flouci_verify_unreachable' };
    }

    const success = res.success === true;
    const payload = res.result as Record<string, unknown> | undefined;
    const statusUpper = typeof payload?.status === 'string' ? payload.status : '';

    let amountMilli: number;
    const rawAmt = payload?.amount;
    if (typeof rawAmt === 'number') amountMilli = rawAmt;
    else if (typeof rawAmt === 'string') amountMilli = Number(rawAmt);
    else amountMilli = NaN;

    const devTrack =
      typeof payload?.developer_tracking_id === 'string' ? payload.developer_tracking_id : null;

    let session =
      paymentId?.length ?
        await this.prisma.coinTopupSession.findFirst({
          where: { flouciPaymentId: paymentId },
        })
      : null;
    if (!session && devTrack) {
      session = await this.prisma.coinTopupSession.findFirst({
        where: { developerTrackingId: devTrack },
      });
    }
    if (!session) return { fulfilled: false, reason: 'session_missing' };

    if (!success || statusUpper !== 'SUCCESS') {
      if (
        session.status === CoinTopupSessionStatus.PENDING &&
        (statusUpper === 'FAILURE' || statusUpper === 'EXPIRED')
      ) {
        await this.safeMarkFailed(session.id);
      }
      return { fulfilled: false, reason: `state_${statusUpper || 'UNKNOWN'}` };
    }

    if (!Number.isFinite(amountMilli)) {
      await this.safeMarkFailed(session.id);
      return { fulfilled: false, reason: 'invalid_verify_payload' };
    }

    const diffMilli = Math.abs(amountMilli - session.amountMillimes);
    if (diffMilli > 3) {
      await this.safeMarkFailed(session.id);
      return { fulfilled: false, reason: 'amount_mismatch' };
    }

    const justFulfilled = await this.transactionalFulfill(session.id);
    if (justFulfilled) {
      const full = await this.prisma.coinTopupSession.findUnique({ where: { id: session.id } });
      if (full) {
        if (full.payerRole === CoinTopupPayerRole.CUSTOMER) {
          this.events.emit('wallet.topup_success', {
            userId: full.userId,
            amount: Number(full.coinsAmount).toFixed(2),
          });
        } else {
          this.events.emit('driver.payment_credited', {
            driverUserId: full.userId,
            amount: Number(full.coinsAmount).toFixed(2),
          });
        }
      }
    }

    const after = await this.prisma.coinTopupSession.findUnique({ where: { id: session.id } });
    const done = after?.status === CoinTopupSessionStatus.COMPLETED;
    return { fulfilled: !!done };
  }

  /** Returns true only when this invocation moved the session to COMPLETED and credited coins. */
  private async transactionalFulfill(sessionId: string): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const lock = await tx.coinTopupSession.findUnique({ where: { id: sessionId } });
        if (!lock || lock.status !== CoinTopupSessionStatus.PENDING) return false;

        const coinsCred = Number(lock.coinsAmount);
        const refId = lock.flouciPaymentId ?? lock.developerTrackingId;

        if (lock.payerRole === CoinTopupPayerRole.CUSTOMER) {
          const wallet = await tx.digitalWallet.findFirst({
            where: { customer: { userId: lock.userId }, countryId: lock.countryId },
            select: { id: true },
          });
          if (!wallet) {
            await tx.coinTopupSession.update({
              where: { id: lock.id },
              data: { status: CoinTopupSessionStatus.FAILED },
            });
            return false;
          }

          await tx.digitalWallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: coinsCred } },
          });
          const w2 = await tx.digitalWallet.findUnique({
            where: { id: wallet.id },
            select: { balance: true },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: WalletTransactionType.TOP_UP,
              amount: coinsCred,
              status: TransactionStatus.SUCCESS,
              referenceId: refId ?? undefined,
              referenceType: ReferenceType.FLOUCI_TOPUP,
              balanceAfter: Number(w2!.balance),
            },
          });
        } else if (lock.payerRole === CoinTopupPayerRole.DRIVER) {
          const account = await tx.driverAccount.findFirst({
            where: { driver: { userId: lock.userId } },
            select: { id: true },
          });
          if (!account) {
            await tx.coinTopupSession.update({
              where: { id: lock.id },
              data: { status: CoinTopupSessionStatus.FAILED },
            });
            return false;
          }

          await tx.driverAccount.update({
            where: { id: account.id },
            data: { balance: { increment: coinsCred } },
          });
          const a2 = await tx.driverAccount.findUnique({
            where: { id: account.id },
            select: { balance: true },
          });

          await tx.driverTransaction.create({
            data: {
              accountId: account.id,
              type: DriverTransactionType.DEPOSIT,
              amount: coinsCred,
              referenceId: refId ?? undefined,
              referenceType: 'FLOUCI_TOPUP',
              description: 'Flouci coin top-up',
              balanceAfter: Number(a2!.balance),
            },
          });
        }

        await tx.coinTopupSession.update({
          where: { id: lock.id },
          data: { status: CoinTopupSessionStatus.COMPLETED, completedAt: new Date() },
        });
        return true;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 12_000,
      },
    );
  }

  private async safeMarkFailed(id: string) {
    await this.prisma.coinTopupSession
      .updateMany({
        where: { id, status: CoinTopupSessionStatus.PENDING },
        data: { status: CoinTopupSessionStatus.FAILED },
      })
      .catch(() => undefined);
  }

  private async resolveContext(
    userId: string,
    role: UserRole,
    lookup?: WalletLookup,
  ): Promise<ResolvedCoinContext> {
    const now = new Date();

    const activeCfg = async (countryId: string) =>
      this.prisma.countryCoinConfig.findFirst({
        where: {
          countryId,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });

    if (role === UserRole.CUSTOMER) {
      const wallet = await this.resolveCustomerWallet(userId, lookup);
      if (!wallet) throw new NotFoundException('Wallet not found');

      const cfg = await activeCfg(wallet.countryId);
      const rate = cfg ? Number(cfg.coinsPerFiatUnit) : NaN;

      if (!cfg || !(rate > 0)) {
        throw new ServiceUnavailableException('Coin pricing is inactive for your country.');
      }

      return {
        payerRole: CoinTopupPayerRole.CUSTOMER,
        countryId: wallet.countryId,
        currencyCode: wallet.country.currencyCode,
        currencySymbol: wallet.country.currencySymbol,
        coinsPerFiatUnit: rate,
      };
    }

    if (role === UserRole.DRIVER) {
      const account = await this.prisma.driverAccount.findFirst({
        where: { driver: { userId } },
      });
      if (!account) throw new NotFoundException('Driver account not found');

      const cur = (account.currency ?? 'TND').trim();

      const country = await this.prisma.country.findFirst({
        where: { currencyCode: cur },
        orderBy: { name: 'asc' },
        select: { id: true, currencyCode: true, currencySymbol: true },
      });
      if (!country) {
        throw new BadRequestException(
          `No country currency row for '${cur}'. Add the country or fix driver account currency.`,
        );
      }

      const cfg = await activeCfg(country.id);
      const rate = cfg ? Number(cfg.coinsPerFiatUnit) : NaN;
      if (!cfg || !(rate > 0)) {
        throw new ServiceUnavailableException('Coin pricing is inactive for your wallet currency.');
      }

      return {
        payerRole: CoinTopupPayerRole.DRIVER,
        countryId: country.id,
        currencyCode: country.currencyCode,
        currencySymbol: country.currencySymbol,
        coinsPerFiatUnit: rate,
      };
    }

    throw new ForbiddenException('Unsupported role');
  }

  private async resolveCustomerWallet(userId: string, lookup?: WalletLookup) {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) return null;

    if (lookup?.walletId) {
      return this.prisma.digitalWallet.findFirst({
        where: { id: lookup.walletId, customerId: customer.id },
        select: {
          countryId: true,
          country: { select: { currencyCode: true, currencySymbol: true } },
        },
      });
    }

    if (lookup?.countryId) {
      return this.prisma.digitalWallet.findUnique({
        where: { customerId_countryId: { customerId: customer.id, countryId: lookup.countryId } },
        select: {
          countryId: true,
          country: { select: { currencyCode: true, currencySymbol: true } },
        },
      });
    }

    if (customer.primaryWalletId) {
      const primary = await this.prisma.digitalWallet.findUnique({
        where: { id: customer.primaryWalletId },
        select: {
          countryId: true,
          country: { select: { currencyCode: true, currencySymbol: true } },
        },
      });
      if (primary) return primary;
    }

    return this.prisma.digitalWallet.findFirst({
      where: { customerId: customer.id },
      orderBy: { updatedAt: 'asc' },
      select: {
        countryId: true,
        country: { select: { currencyCode: true, currencySymbol: true } },
      },
    });
  }

  private flouciAuthorization(): string | null {
    const pub =
      this.config.get<string>('FLOUCI_APP_PUBLIC_KEY') ??
      this.config.get<string>('FLOUCI_PUBLIC_KEY');
    const sec =
      this.config.get<string>('FLOUCI_APP_SECRET') ??
      this.config.get<string>('FLOUCI_PRIVATE_KEY') ??
      this.config.get<string>('FLOUCI_PRIVATE_TOKEN');
    if (!pub || !sec || !pub.trim() || !sec.trim()) return null;
    return `Bearer ${pub.trim()}:${sec.trim()}`;
  }

  private backendPublicOrigin(): string {
    const explicitly = this.config.get<string>('PUBLIC_API_BASE_URL');
    const port =
      typeof process.env.PORT === 'string'
        ? process.env.PORT
        : `${this.config.get<number>('PORT') ?? 3000}`;

    if (explicitly && /^https?:\/\//i.test(explicitly)) {
      return explicitly.replace(/\/$/, '').replace(/\/?api\/?$/i, '');
    }
    const host =
      typeof process.env.PUBLIC_BACKEND_HOST === 'string'
        ? process.env.PUBLIC_BACKEND_HOST.trim()
        : '';
    const base = host && host.length ? `http://${host}:${port}` : `http://localhost:${port}`;
    return base.replace(/\/$/, '');
  }
}
