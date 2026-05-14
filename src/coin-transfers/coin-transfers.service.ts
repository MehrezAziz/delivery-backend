import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import {
  CoinTransferStatus,
  CustomerStatus,
  DriverStatus,
  NotificationType,
  Prisma,
  ReferenceType,
  TransactionStatus,
  WalletTransactionType,
  DriverTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SecuritySessionService } from '../auth/security-session.service';
import type { CreateTransferChallengeDto } from './dto/coin-transfer.dto';

const CHALLENGE_TTL_MS = 120_000;
const PIN_LOCK_AFTER_FAILS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sender debits `gross`; recipient receives `net`; platform fee is `fee` (fee+net=gross after rounding fix). */
export function splitGrossIntoFeeAndNet(gross: number, feeBps: number): { feeCoins: number; netCoins: number } {
  const feeRaw = (gross * feeBps) / 10000;
  let feeCoins = round2(feeRaw);
  let netCoins = round2(gross - feeCoins);
  const drift = round2(gross - feeCoins - netCoins);
  feeCoins = round2(feeCoins + drift);
  return { feeCoins, netCoins };
}

@Injectable()
export class CoinTransfersService {
  private readonly logger = new Logger(CoinTransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly securitySession: SecuritySessionService,
  ) {}

  private async getConfigMap(keys: string[]): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.value;
    return m;
  }

  private async assertP2pEnabled(): Promise<void> {
    const m = await this.getConfigMap(['p2p_transfers_enabled']);
    const v = (m.p2p_transfers_enabled ?? 'true').toLowerCase().trim();
    if (v !== 'true' && v !== '1' && v !== 'yes') {
      throw new ServiceUnavailableException('Coin transfers are temporarily disabled');
    }
  }

  private async getMinimumGross(): Promise<number> {
    const m = await this.getConfigMap(['minimum_transfert']);
    const raw = m.minimum_transfert ?? '25';
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 25;
  }

  private async getDelayMinutes(gross: number): Promise<number> {
    const m = await this.getConfigMap([
      'large_transfer_threshold_coins',
      'small_transfer_delay_minutes',
      'large_transfer_delay_min_minutes',
      'large_transfer_delay_max_minutes',
    ]);
    const th = parseFloat(m.large_transfer_threshold_coins ?? '1000');
    if (gross > th) {
      const min = parseInt(m.large_transfer_delay_min_minutes ?? '10', 10) || 10;
      const max = parseInt(m.large_transfer_delay_max_minutes ?? '20', 10) || 20;
      const hi = Math.max(min, max);
      const lo = Math.min(min, max);
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    return parseInt(m.small_transfer_delay_minutes ?? '2', 10) || 2;
  }

  async resolveCountryIdForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: { include: { wallet: true } }, driver: true },
    });
    if (!user) return null;
    if (user.customer?.wallet) return user.customer.wallet.countryId;
    if (user.driver) {
      const addr = await this.prisma.address.findFirst({
        where: { userId },
        include: { delegation: { include: { governorate: true } } },
        orderBy: { id: 'asc' },
      });
      return addr?.delegation?.governorate?.countryId ?? null;
    }
    return null;
  }

  private async getActiveTransferFeeBps(countryId: string): Promise<number> {
    const now = new Date();
    const row = await this.prisma.countryCoinConfig.findFirst({
      where: {
        countryId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row?.transferFeeBps ?? 200;
  }

  /**
   * Coins to credit for cash in this country's fiat (active `CountryCoinConfig.coinsPerFiatUnit` × amount).
   * Use when converting COD / manual cash intake into wallet coins.
   */
  async computeCoinsFromCashFiat(countryId: string, fiatAmount: number): Promise<number> {
    if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) return 0;
    const now = new Date();
    const row = await this.prisma.countryCoinConfig.findFirst({
      where: {
        countryId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    const rate = row ? Number(row.coinsPerFiatUnit) : 1;
    return round2(fiatAmount * rate);
  }

  private async assertUserEligibleForCoinTransfer(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true, driver: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'CUSTOMER') {
      if (!user.customer || user.customer.customerStatus !== CustomerStatus.ACTIVE) {
        throw new ForbiddenException('Only active customers can send or receive coin transfers');
      }
      return;
    }
    if (user.role === 'DRIVER') {
      if (!user.driver || user.driver.status !== DriverStatus.VERIFIED) {
        throw new ForbiddenException('Only verified drivers can send or receive coin transfers');
      }
      return;
    }
    throw new ForbiddenException('Invalid user role for coin transfers');
  }

  private async loadCoinLedger(userId: string): Promise<{
    kind: 'CUSTOMER' | 'DRIVER';
    walletId?: string;
    accountId?: string;
    countryId: string;
    balance: number;
    locked: number;
    available: number;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: { include: { wallet: true } },
        driver: { include: { driverAccount: true } },
      },
    });
    if (!user) return null;
    if (user.role === 'CUSTOMER' && user.customer?.wallet) {
      const w = user.customer.wallet;
      const b = Number(w.balance);
      const l = Number(w.lockedForTransfers ?? 0);
      return {
        kind: 'CUSTOMER',
        walletId: w.id,
        countryId: w.countryId,
        balance: b,
        locked: l,
        available: round2(b - l),
      };
    }
    if (user.role === 'DRIVER' && user.driver?.driverAccount) {
      const a = user.driver.driverAccount;
      const b = Number(a.balance);
      const l = Number(a.lockedForTransfers ?? 0);
      const countryId = await this.resolveCountryIdForUser(userId);
      if (!countryId) return null;
      return {
        kind: 'DRIVER',
        accountId: a.id,
        countryId,
        balance: b,
        locked: l,
        available: round2(b - l),
      };
    }
    return null;
  }

  async verifyTransferPinForGate(userId: string, transferPin: string): Promise<{ ok: true }> {
    await this.verifyTransferPinOnly(userId, transferPin);
    return { ok: true };
  }

  /** After verifying the transfer PIN, opens the same post–Security-screen window as password unlock. */
  async establishSecuritySessionWithPin(userId: string, transferPin: string): Promise<{ ok: true }> {
    await this.verifyTransferPinOnly(userId, transferPin);
    this.securitySession.grant(userId);
    return { ok: true };
  }

  async clearTransferPin(userId: string, oldTransferPin?: string): Promise<{ ok: true }> {
    const bypass = this.securitySession.isActive(userId);
    if (!bypass) {
      const old = (oldTransferPin ?? '').trim();
      if (!old || !/^\d{8}$/.test(old)) {
        throw new BadRequestException('Current transfer PIN is required to remove your PIN');
      }
      await this.verifyTransferPinOnly(userId, old);
    }
    await this.prisma.userTransferPin.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async setTransferPin(userId: string, transferPin: string, oldTransferPin?: string): Promise<{ ok: true }> {
    if (!/^\d{8}$/.test(transferPin)) {
      throw new BadRequestException('Transfer PIN must be exactly 8 digits');
    }
    const existing = await this.prisma.userTransferPin.findUnique({ where: { userId } });
    const bypass = this.securitySession.isActive(userId);
    if (existing && !bypass) {
      if (!oldTransferPin) {
        throw new BadRequestException('Current transfer PIN is required to change your PIN');
      }
      if (!/^\d{8}$/.test(oldTransferPin)) {
        throw new BadRequestException('Current transfer PIN must be exactly 8 digits');
      }
      if (existing.lockedUntil && existing.lockedUntil > new Date()) {
        throw new ForbiddenException('Transfer PIN is locked. Try again later.');
      }
      const match = await bcrypt.compare(oldTransferPin, existing.pinHash);
      if (!match) {
        const fails = existing.failedAttempts + 1;
        const data =
          fails >= PIN_LOCK_AFTER_FAILS
            ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + PIN_LOCK_MS) }
            : { failedAttempts: fails };
        await this.prisma.userTransferPin.update({ where: { userId }, data });
        throw new ForbiddenException('Invalid current transfer PIN');
      }
    }
    const pinHash = await bcrypt.hash(transferPin, BCRYPT_ROUNDS);
    await this.prisma.userTransferPin.upsert({
      where: { userId },
      create: { userId, pinHash, failedAttempts: 0, lockedUntil: null },
      update: { pinHash, failedAttempts: 0, lockedUntil: null },
    });
    return { ok: true };
  }

  async verifyTransferPinOnly(userId: string, pin: string): Promise<void> {
    if (!/^\d{8}$/.test(pin)) {
      throw new BadRequestException('Transfer PIN must be exactly 8 digits');
    }
    const row = await this.prisma.userTransferPin.findUnique({ where: { userId } });
    if (!row) {
      throw new BadRequestException('Transfer PIN is not set. Configure it in Settings → Security if you want extra protection for sends.');
    }
    if (row.lockedUntil && row.lockedUntil > new Date()) {
      throw new ForbiddenException('Transfer PIN is locked. Try again later.');
    }
    const ok = await bcrypt.compare(pin, row.pinHash);
    if (!ok) {
      const fails = row.failedAttempts + 1;
      const data =
        fails >= PIN_LOCK_AFTER_FAILS
          ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + PIN_LOCK_MS) }
          : { failedAttempts: fails };
      await this.prisma.userTransferPin.update({ where: { userId }, data });
      throw new ForbiddenException('Invalid transfer PIN');
    }
    await this.prisma.userTransferPin.update({
      where: { userId },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  private async verifyAccountPasswordForChallenge(userId: string, rawPassword: string): Promise<void> {
    const pwd = (rawPassword ?? '').trim();
    if (pwd.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.password) {
      throw new BadRequestException(
        'No account password is set on this account. Use your 8-digit transfer PIN or set a password in Settings.',
      );
    }
    const ok = await bcrypt.compare(pwd, user.password);
    if (!ok) throw new UnauthorizedException('Invalid password');
  }

  private hashChallengeToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  async createChallenge(
    userId: string,
    dto: CreateTransferChallengeDto = {},
  ): Promise<{ challengeToken: string; expiresAt: string }> {
    await this.assertP2pEnabled();
    const pinTrim = (dto.transferPin ?? '').trim();
    const passTrim = (dto.accountPassword ?? '').trim();
    if (pinTrim && passTrim) {
      throw new BadRequestException('Provide either transfer PIN or account password, not both');
    }
    const row = await this.prisma.userTransferPin.findUnique({ where: { userId } });
    if (row) {
      if (!pinTrim && !passTrim) {
        throw new BadRequestException('Transfer PIN or account password is required to authorize coin sends');
      }
      if (pinTrim) await this.verifyTransferPinOnly(userId, pinTrim);
      else await this.verifyAccountPasswordForChallenge(userId, passTrim);
    } else if (passTrim) {
      await this.verifyAccountPasswordForChallenge(userId, passTrim);
    }
    const plain = randomBytes(32).toString('hex');
    const tokenHash = this.hashChallengeToken(plain);
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await this.prisma.transferStepUpChallenge.create({
      data: { userId, tokenHash, expiresAt },
    });
    return { challengeToken: plain, expiresAt: expiresAt.toISOString() };
  }

  /** Trim; remove spaces/dashes. Caller must enforce E.164 with +. */
  normalizeCoinRecipientPhone(raw: string | undefined | null): string {
    if (raw == null) return '';
    return String(raw).trim().replace(/[\s\-\u00A0]/g, '');
  }

  /**
   * Resolves recipient from exactly one of UUID or E.164 phone (must match `users.phone` unique column).
   */
  async resolveRecipientUserIdOrThrow(
    senderUserId: string,
    dto: { recipientUserId?: string; recipientPhone?: string },
  ): Promise<string> {
    const id = (dto.recipientUserId ?? '').trim();
    const phoneNorm = this.normalizeCoinRecipientPhone(dto.recipientPhone);
    if (id && phoneNorm) {
      throw new BadRequestException('Provide either recipient user ID or phone number, not both.');
    }
    if (!id && !phoneNorm) {
      throw new BadRequestException(
        'Provide recipient user ID or phone number in international format (e.g. +21655664488).',
      );
    }
    if (id) {
      if (id === senderUserId) throw new BadRequestException('Cannot send coins to yourself');
      return id;
    }
    if (!/^\+\d{10,15}$/.test(phoneNorm)) {
      throw new BadRequestException('Phone must be E.164 with country code (e.g. +21655664488).');
    }
    const recipient = await this.prisma.user.findFirst({
      where: { phone: phoneNorm },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('No account found for this phone number.');
    if (recipient.id === senderUserId) throw new BadRequestException('Cannot send coins to yourself');
    return recipient.id;
  }

  async previewTransfer(senderUserId: string, recipientUserId: string, grossCoins: number) {
    await this.assertP2pEnabled();
    await this.assertUserEligibleForCoinTransfer(senderUserId);
    await this.assertUserEligibleForCoinTransfer(recipientUserId);
    if (senderUserId === recipientUserId) {
      throw new BadRequestException('Cannot send coins to yourself');
    }
    const min = await this.getMinimumGross();
    if (grossCoins < min) {
      throw new BadRequestException(`Minimum transfer is ${min} coins (gross)`);
    }
    const senderCountry = await this.resolveCountryIdForUser(senderUserId);
    if (!senderCountry) {
      throw new BadRequestException('Sender country could not be resolved; complete wallet setup first.');
    }
    const feeBps = await this.getActiveTransferFeeBps(senderCountry);
    const { feeCoins, netCoins } = splitGrossIntoFeeAndNet(grossCoins, feeBps);
    const delayMin = await this.getDelayMinutes(grossCoins);
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientUserId },
      select: { firstName: true, secondName: true, role: true },
    });
    const recipientLabel = [recipient?.firstName, recipient?.secondName].filter(Boolean).join(' ') || recipientUserId;
    return {
      grossCoins: round2(grossCoins),
      feeBps,
      feeCoins,
      netCoins,
      minimumGross: min,
      pendingDelayMinutes: delayMin,
      feeModel: 'sender_pays_gross' as const,
      recipientPreview: { userId: recipientUserId, displayName: recipientLabel, role: recipient?.role },
    };
  }

  async createTransfer(
    senderUserId: string,
    dto: {
      recipientUserId: string;
      grossCoins: number;
      challengeToken: string;
      giftMessage?: string;
      scheduledAt?: Date;
    },
    opts?: { idempotencyKey?: string | null; clientIp?: string | null; deviceId?: string | null },
  ) {
    await this.assertP2pEnabled();
    if (opts?.idempotencyKey) {
      const existing = await this.prisma.coinTransfer.findUnique({
        where: { idempotencyKey: opts.idempotencyKey },
      });
      if (existing) return this.serializeTransfer(existing);
    }
    await this.assertUserEligibleForCoinTransfer(senderUserId);
    await this.assertUserEligibleForCoinTransfer(dto.recipientUserId);
    if (senderUserId === dto.recipientUserId) {
      throw new BadRequestException('Cannot send coins to yourself');
    }
    const min = await this.getMinimumGross();
    if (dto.grossCoins < min) {
      throw new BadRequestException(`Minimum transfer is ${min} coins (gross)`);
    }
    const senderLedger = await this.loadCoinLedger(senderUserId);
    const recipientLedger = await this.loadCoinLedger(dto.recipientUserId);
    if (!senderLedger || !recipientLedger) {
      throw new BadRequestException('Wallet or driver account is not available for one of the users');
    }
    if (senderLedger.available < dto.grossCoins) {
      throw new BadRequestException('Insufficient available balance (coins reserved for other pending transfers?)');
    }
    const feeBps = await this.getActiveTransferFeeBps(senderLedger.countryId);
    const { feeCoins, netCoins } = splitGrossIntoFeeAndNet(dto.grossCoins, feeBps);
    const now = new Date();
    const scheduledAt = dto.scheduledAt && dto.scheduledAt > new Date(now.getTime() + 3000) ? dto.scheduledAt : null;
    const delayMin = await this.getDelayMinutes(dto.grossCoins);
    const pendingUntil = scheduledAt
      ? null
      : new Date(now.getTime() + delayMin * 60 * 1000);
    const status = scheduledAt ? CoinTransferStatus.SCHEDULED : CoinTransferStatus.PENDING;

    return this.prisma.$transaction(async (tx) => {
      await this.consumeChallengeInTx(tx, senderUserId, dto.challengeToken);
      const transfer = await tx.coinTransfer.create({
        data: {
          senderUserId,
          recipientUserId: dto.recipientUserId,
          grossCoins: dto.grossCoins,
          feeCoins,
          netCoins,
          feeBps,
          status,
          giftMessage: dto.giftMessage?.trim() || null,
          scheduledAt: scheduledAt,
          pendingUntil,
          idempotencyKey: opts?.idempotencyKey || null,
          senderCountryId: senderLedger.countryId,
          recipientCountryId: recipientLedger.countryId,
          clientIp: opts?.clientIp || null,
          deviceId: opts?.deviceId || null,
        },
      });
      if (!scheduledAt) {
        if (senderLedger.kind === 'CUSTOMER') {
          await tx.digitalWallet.update({
            where: { id: senderLedger.walletId! },
            data: { lockedForTransfers: { increment: dto.grossCoins } },
          });
        } else {
          await tx.driverAccount.update({
            where: { id: senderLedger.accountId! },
            data: { lockedForTransfers: { increment: dto.grossCoins } },
          });
        }
      }
      return this.serializeTransfer(transfer);
    });
  }

  private async consumeChallengeInTx(tx: Prisma.TransactionClient, userId: string, plainToken: string) {
    const tokenHash = this.hashChallengeToken(plainToken);
    const now = new Date();
    const res = await tx.transferStepUpChallenge.updateMany({
      where: {
        userId,
        tokenHash,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (res.count !== 1) {
      throw new ForbiddenException('Invalid or expired step-up challenge. Request a new one after confirming your identity.');
    }
  }

  async cancelTransfer(senderUserId: string, transferId: string) {
    await this.assertP2pEnabled();
    const t = await this.prisma.coinTransfer.findFirst({
      where: { id: transferId, senderUserId },
    });
    if (!t) throw new NotFoundException('Transfer not found');
    if (t.status !== CoinTransferStatus.PENDING && t.status !== CoinTransferStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled or pending transfers can be cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      const cur = await tx.coinTransfer.findFirst({ where: { id: transferId, senderUserId } });
      if (!cur || (cur.status !== CoinTransferStatus.PENDING && cur.status !== CoinTransferStatus.SCHEDULED)) {
        throw new BadRequestException('Transfer is no longer cancellable');
      }
      if (cur.status === CoinTransferStatus.PENDING) {
        const senderLedger = await this.loadCoinLedgerTx(tx, senderUserId);
        if (!senderLedger) throw new BadRequestException('Sender ledger not found');
        const gross = Number(cur.grossCoins);
        if (senderLedger.kind === 'CUSTOMER') {
          await tx.digitalWallet.update({
            where: { id: senderLedger.walletId! },
            data: { lockedForTransfers: { decrement: gross } },
          });
        } else {
          await tx.driverAccount.update({
            where: { id: senderLedger.accountId! },
            data: { lockedForTransfers: { decrement: gross } },
          });
        }
      }
      await tx.coinTransfer.update({
        where: { id: transferId },
        data: { status: CoinTransferStatus.CANCELLED, cancelledAt: new Date() },
      });
    });
    await this.notifications.send({
      userId: senderUserId,
      userType: 'USER',
      type: NotificationType.COIN_TRANSFER_CANCELLED,
      templateData: { transferId, amount: String(t.grossCoins) },
      relatedEntityType: 'CoinTransfer',
      relatedEntityId: transferId,
    });
    return { ok: true };
  }

  /** Sender only: update `scheduledAt` while the transfer is still SCHEDULED. */
  async rescheduleTransfer(senderUserId: string, transferId: string, newScheduledAt: Date) {
    await this.assertP2pEnabled();
    const now = new Date();
    const minLeadMs = 60_000;
    if (newScheduledAt.getTime() <= now.getTime() + minLeadMs) {
      throw new BadRequestException('Scheduled time must be at least one minute in the future');
    }
    const t = await this.prisma.coinTransfer.findFirst({
      where: { id: transferId, senderUserId },
    });
    if (!t) throw new NotFoundException('Transfer not found');
    if (t.status !== CoinTransferStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled transfers can be rescheduled');
    }
    await this.prisma.coinTransfer.update({
      where: { id: transferId },
      data: { scheduledAt: newScheduledAt },
    });
    const updated = await this.prisma.coinTransfer.findUnique({ where: { id: transferId } });
    if (!updated) throw new NotFoundException('Transfer not found');
    return this.serializeTransferForUser(updated, senderUserId);
  }

  private async loadCoinLedgerTx(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        customer: { include: { wallet: true } },
        driver: { include: { driverAccount: true } },
      },
    });
    if (!user) return null;
    if (user.role === 'CUSTOMER' && user.customer?.wallet) {
      const w = user.customer.wallet;
      const b = Number(w.balance);
      const l = Number(w.lockedForTransfers ?? 0);
      return {
        kind: 'CUSTOMER' as const,
        walletId: w.id,
        countryId: w.countryId,
        balance: b,
        locked: l,
        available: round2(b - l),
      };
    }
    if (user.role === 'DRIVER' && user.driver?.driverAccount) {
      const a = user.driver.driverAccount;
      const b = Number(a.balance);
      const l = Number(a.lockedForTransfers ?? 0);
      const countryId = await this.resolveCountryIdForUserTx(tx, userId);
      if (!countryId) return null;
      return {
        kind: 'DRIVER' as const,
        accountId: a.id,
        countryId,
        balance: b,
        locked: l,
        available: round2(b - l),
      };
    }
    return null;
  }

  private async resolveCountryIdForUserTx(tx: Prisma.TransactionClient, userId: string): Promise<string | null> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { customer: { include: { wallet: true } } },
    });
    if (user?.customer?.wallet) return user.customer.wallet.countryId;
    const addr = await tx.address.findFirst({
      where: { userId },
      include: { delegation: { include: { governorate: true } } },
      orderBy: { id: 'asc' },
    });
    return addr?.delegation?.governorate?.countryId ?? null;
  }

  async reportTransfer(reporterUserId: string, transferId: string, note?: string) {
    const t = await this.prisma.coinTransfer.findFirst({
      where: {
        id: transferId,
        OR: [{ senderUserId: reporterUserId }, { recipientUserId: reporterUserId }],
      },
    });
    if (!t) throw new NotFoundException('Transfer not found');
    await this.prisma.coinTransferReport.create({
      data: {
        transferId,
        reporterUserId,
        note: note?.trim() || null,
      },
    });
    return { ok: true };
  }

  async getTransferForViewer(userId: string, transferId: string) {
    const t = await this.prisma.coinTransfer.findFirst({
      where: {
        id: transferId,
        OR: [{ senderUserId: userId }, { recipientUserId: userId }],
      },
    });
    if (!t) throw new NotFoundException('Transfer not found');
    if (
      t.recipientUserId === userId &&
      t.senderUserId !== userId &&
      t.status === CoinTransferStatus.SCHEDULED
    ) {
      throw new NotFoundException('Transfer not found');
    }
    return this.serializeTransferForUser(t, userId);
  }

  async listMyTransfers(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.CoinTransferWhereInput = {
      OR: [
        { senderUserId: userId },
        {
          AND: [
            { recipientUserId: userId },
            { status: { not: CoinTransferStatus.SCHEDULED } },
          ],
        },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.coinTransfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.coinTransfer.count({ where }),
    ]);
    return {
      transfers: rows.map((r) => this.serializeTransferForUser(r, userId)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async adminListTransfers(page = 1, limit = 50, userId?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.CoinTransferWhereInput = userId
      ? { OR: [{ senderUserId: userId }, { recipientUserId: userId }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.coinTransfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.coinTransfer.count({ where }),
    ]);
    return {
      transfers: rows.map((r) => this.serializeTransfer(r)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Cron: activate scheduled transfers; settle pending after delay. */
  async processDueTransfers(): Promise<void> {
    const now = new Date();
    const scheduled = await this.prisma.coinTransfer.findMany({
      where: { status: CoinTransferStatus.SCHEDULED, scheduledAt: { lte: now } },
      take: 50,
      orderBy: { scheduledAt: 'asc' },
    });
    for (const t of scheduled) {
      try {
        await this.activateScheduledTransfer(t.id);
      } catch (e) {
        this.logger.warn(`activateScheduled ${t.id}: ${(e as Error).message}`);
      }
    }
    const pending = await this.prisma.coinTransfer.findMany({
      where: { status: CoinTransferStatus.PENDING, pendingUntil: { lte: now } },
      take: 50,
      orderBy: { pendingUntil: 'asc' },
    });
    for (const t of pending) {
      try {
        await this.settleTransfer(t.id);
      } catch (e) {
        this.logger.warn(`settleTransfer ${t.id}: ${(e as Error).message}`);
      }
    }
  }

  private async activateScheduledTransfer(transferId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.coinTransfer.findFirst({
        where: { id: transferId, status: CoinTransferStatus.SCHEDULED },
      });
      if (!t) return;
      const gross = Number(t.grossCoins);
      const senderLedger = await this.loadCoinLedgerTx(tx, t.senderUserId);
      const recipientLedger = await this.loadCoinLedgerTx(tx, t.recipientUserId);
      if (!senderLedger || !recipientLedger) {
        await tx.coinTransfer.update({
          where: { id: transferId },
          data: {
            status: CoinTransferStatus.FAILED,
            failedReason: 'Ledger not available at schedule time',
          },
        });
        return;
      }
      if (senderLedger.available < gross) {
        await tx.coinTransfer.update({
          where: { id: transferId },
          data: { status: CoinTransferStatus.FAILED, failedReason: 'Insufficient balance at schedule time' },
        });
        return;
      }
      const delayMin = await this.getDelayMinutes(gross);
      const pendingUntil = new Date(Date.now() + delayMin * 60 * 1000);
      if (senderLedger.kind === 'CUSTOMER') {
        await tx.digitalWallet.update({
          where: { id: senderLedger.walletId! },
          data: { lockedForTransfers: { increment: gross } },
        });
      } else {
        await tx.driverAccount.update({
          where: { id: senderLedger.accountId! },
          data: { lockedForTransfers: { increment: gross } },
        });
      }
      await tx.coinTransfer.update({
        where: { id: transferId },
        data: { status: CoinTransferStatus.PENDING, pendingUntil },
      });
    });
  }

  private async settleTransfer(transferId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.coinTransfer.findFirst({
        where: { id: transferId, status: CoinTransferStatus.PENDING },
      });
      if (!t || !t.pendingUntil || t.pendingUntil > new Date()) return;
      const gross = Number(t.grossCoins);
      const net = Number(t.netCoins);
      const senderLedger = await this.loadCoinLedgerTx(tx, t.senderUserId);
      const recipientLedger = await this.loadCoinLedgerTx(tx, t.recipientUserId);
      if (!senderLedger || !recipientLedger) {
        await tx.coinTransfer.update({
          where: { id: transferId },
          data: { status: CoinTransferStatus.FAILED, failedReason: 'Missing ledger at settlement' },
        });
        return;
      }
      if (senderLedger.kind === 'CUSTOMER') {
        const r = await tx.digitalWallet.updateMany({
          where: {
            id: senderLedger.walletId!,
            lockedForTransfers: { gte: gross },
            balance: { gte: gross },
          },
          data: {
            balance: { decrement: gross },
            lockedForTransfers: { decrement: gross },
          },
        });
        if (r.count !== 1) {
          await this.failAndReleaseLockTx(tx, transferId, t.senderUserId, gross, 'CUSTOMER');
          return;
        }
        const w = await tx.digitalWallet.findUnique({ where: { id: senderLedger.walletId! } });
        if (!w) return;
        await tx.walletTransaction.create({
          data: {
            walletId: w.id,
            type: WalletTransactionType.COIN_TRANSFER_SENT,
            amount: -gross,
            status: TransactionStatus.SUCCESS,
            referenceId: transferId,
            referenceType: ReferenceType.COIN_TRANSFER,
            balanceAfter: Number(w.balance),
          },
        });
      } else {
        const r = await tx.driverAccount.updateMany({
          where: {
            id: senderLedger.accountId!,
            lockedForTransfers: { gte: gross },
            balance: { gte: gross },
          },
          data: {
            balance: { decrement: gross },
            lockedForTransfers: { decrement: gross },
          },
        });
        if (r.count !== 1) {
          await this.failAndReleaseLockTx(tx, transferId, t.senderUserId, gross, 'DRIVER');
          return;
        }
        const a = await tx.driverAccount.findUnique({ where: { id: senderLedger.accountId! } });
        if (!a) return;
        await tx.driverTransaction.create({
          data: {
            accountId: a.id,
            type: DriverTransactionType.COIN_TRANSFER_SENT,
            amount: -gross,
            referenceId: transferId,
            referenceType: 'COIN_TRANSFER',
            description: 'Coin transfer sent',
            balanceAfter: Number(a.balance),
          },
        });
      }
      if (recipientLedger.kind === 'CUSTOMER') {
        const w = await tx.digitalWallet.findUnique({ where: { id: recipientLedger.walletId! } });
        if (!w) throw new Error('Recipient wallet missing');
        await tx.digitalWallet.update({
          where: { id: w.id },
          data: { balance: { increment: net } },
        });
        const w2 = await tx.digitalWallet.findUnique({ where: { id: w.id } });
        await tx.walletTransaction.create({
          data: {
            walletId: w.id,
            type: WalletTransactionType.COIN_TRANSFER_RECEIVED,
            amount: net,
            status: TransactionStatus.SUCCESS,
            referenceId: transferId,
            referenceType: ReferenceType.COIN_TRANSFER,
            balanceAfter: Number(w2!.balance),
          },
        });
      } else {
        const a = await tx.driverAccount.findUnique({ where: { id: recipientLedger.accountId! } });
        if (!a) throw new Error('Recipient driver account missing');
        await tx.driverAccount.update({
          where: { id: a.id },
          data: { balance: { increment: net } },
        });
        const a2 = await tx.driverAccount.findUnique({ where: { id: a.id } });
        await tx.driverTransaction.create({
          data: {
            accountId: a.id,
            type: DriverTransactionType.COIN_TRANSFER_RECEIVED,
            amount: net,
            referenceId: transferId,
            referenceType: 'COIN_TRANSFER',
            description: 'Coin transfer received',
            balanceAfter: Number(a2!.balance),
          },
        });
      }
      await tx.coinTransfer.update({
        where: { id: transferId },
        data: { status: CoinTransferStatus.COMPLETED, completedAt: new Date() },
      });
    });
    const done = await this.prisma.coinTransfer.findUnique({ where: { id: transferId } });
    if (done?.status === CoinTransferStatus.COMPLETED) {
      const sender = await this.prisma.user.findUnique({
        where: { id: done.senderUserId },
        select: { firstName: true, secondName: true },
      });
      const label = [sender?.firstName, sender?.secondName].filter(Boolean).join(' ') || 'Someone';
      await this.notifications.send({
        userId: done.recipientUserId,
        userType: 'USER',
        type: NotificationType.COIN_TRANSFER_RECEIVED,
        templateData: {
          amount: String(done.netCoins),
          senderName: label,
          transferId,
          giftMessage: done.giftMessage ?? '',
        },
        relatedEntityType: 'CoinTransfer',
        relatedEntityId: transferId,
        actionButtons: [
          { id: 'report', title: 'Report if wrong', action: `coin_transfer_report:${transferId}` },
        ],
      });
      await this.notifications.send({
        userId: done.senderUserId,
        userType: 'USER',
        type: NotificationType.COIN_TRANSFER_OUTBOUND_COMPLETED,
        templateData: { amount: String(done.grossCoins), recipientId: done.recipientUserId, transferId },
        relatedEntityType: 'CoinTransfer',
        relatedEntityId: transferId,
      });
    }
  }

  private async failAndReleaseLockTx(
    tx: Prisma.TransactionClient,
    transferId: string,
    senderUserId: string,
    gross: number,
    kind: 'CUSTOMER' | 'DRIVER',
  ) {
    const ledger = await this.loadCoinLedgerTx(tx, senderUserId);
    if (ledger?.kind === 'CUSTOMER' && kind === 'CUSTOMER' && ledger.walletId) {
      await tx.digitalWallet.update({
        where: { id: ledger.walletId },
        data: { lockedForTransfers: { decrement: gross } },
      });
    } else if (ledger?.kind === 'DRIVER' && kind === 'DRIVER' && ledger.accountId) {
      await tx.driverAccount.update({
        where: { id: ledger.accountId },
        data: { lockedForTransfers: { decrement: gross } },
      });
    }
    await tx.coinTransfer.update({
      where: { id: transferId },
      data: { status: CoinTransferStatus.FAILED, failedReason: 'Insufficient balance at settlement' },
    });
  }

  private serializeTransfer(t: {
    id: string;
    senderUserId: string;
    recipientUserId: string;
    grossCoins: Prisma.Decimal;
    feeCoins: Prisma.Decimal;
    netCoins: Prisma.Decimal;
    feeBps: number;
    status: CoinTransferStatus;
    giftMessage: string | null;
    scheduledAt: Date | null;
    pendingUntil: Date | null;
    createdAt: Date;
    completedAt: Date | null;
    cancelledAt: Date | null;
    failedReason: string | null;
  }) {
    return {
      id: t.id,
      senderUserId: t.senderUserId,
      recipientUserId: t.recipientUserId,
      grossCoins: Number(t.grossCoins),
      feeCoins: Number(t.feeCoins),
      netCoins: Number(t.netCoins),
      feeBps: t.feeBps,
      status: t.status,
      giftMessage: t.giftMessage,
      scheduledAt: t.scheduledAt?.toISOString() ?? null,
      pendingUntil: t.pendingUntil?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      cancelledAt: t.cancelledAt?.toISOString() ?? null,
      failedReason: t.failedReason,
    };
  }

  /** List/detail: recipients must not infer platform fee from API fields; senders keep full breakdown. */
  private serializeTransferForUser(
    t: {
      id: string;
      senderUserId: string;
      recipientUserId: string;
      grossCoins: Prisma.Decimal;
      feeCoins: Prisma.Decimal;
      netCoins: Prisma.Decimal;
      feeBps: number;
      status: CoinTransferStatus;
      giftMessage: string | null;
      scheduledAt: Date | null;
      pendingUntil: Date | null;
      createdAt: Date;
      completedAt: Date | null;
      cancelledAt: Date | null;
      failedReason: string | null;
    },
    viewerUserId: string,
  ) {
    const base = this.serializeTransfer(t);
    const isRecipientOnly =
      t.recipientUserId === viewerUserId && t.senderUserId !== viewerUserId;
    if (!isRecipientOnly) {
      return { ...base, showFeeBreakdown: true };
    }
    const net = Number(t.netCoins);
    return {
      ...base,
      grossCoins: net,
      feeCoins: 0,
      feeBps: 0,
      netCoins: net,
      showFeeBreakdown: false,
    };
  }
}
