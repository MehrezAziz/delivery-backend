import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PriceCalculationService } from './services/price-calculation.service';
import { DriverAssignmentService } from './services/driver-assignment.service';
import { CreateOrderDto, PreviewOrderDto, ChangePaymentMethodDto, OrderResponseDto } from './dto/order.dto';
import {
  OrderStatus,
  PaymentType,
  CustomerStatus,
  WalletTransactionType,
  TransactionStatus,
  ReferenceType,
  ReferralCommissionStatus,
  DriverStatus,
  NotificationType,
  NotificationPriority,
  CustomerServiceRole,
  OrderSourceType,
  DeliveryCompanyTransactionType,
  DriverTransactionType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { rollbackDeliveryCompanyOrderFundsInTx } from '../delivery-company/company-order-budget.util';
import { CountryCoinConfigService } from '../wallet/country-coin-config.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceCalculationService: PriceCalculationService,
    private readonly driverAssignmentService: DriverAssignmentService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly eventEmitter: EventEmitter2,
    private readonly coinConfig: CountryCoinConfigService,
    private readonly walletService: WalletService,
  ) {}

  // ISO code → IANA timezone mapping for night delivery auto-detection
  private static readonly COUNTRY_TIMEZONES: Record<string, string> = {
    TN: 'Africa/Tunis', DZ: 'Africa/Algiers', MA: 'Africa/Casablanca', LY: 'Africa/Tripoli',
    EG: 'Africa/Cairo', SA: 'Asia/Riyadh', AE: 'Asia/Dubai', FR: 'Europe/Paris',
    US: 'America/New_York', GB: 'Europe/London', DE: 'Europe/Berlin', TR: 'Europe/Istanbul',
  };

  /** Generate a short random tracking token e.g. TRK-A3F9X2 */
  private generateTrackingToken(): string {
    return 'TRK-' + randomBytes(4).toString('hex').toUpperCase();
  }

  /** Read tracking_expiry_minutes from SystemConfig, fallback to 5 */
  private async getTrackingExpiryMinutes(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({ where: { key: 'tracking_expiry_minutes' } });
    if (config) {
      const val = parseInt(config.value, 10);
      if (!isNaN(val) && val > 0) return val;
    }
    return 5;
  }

  private static readonly MAX_CUSTOMER_EXTRA = 10000;

  private assertSameCountryPickupDropoff(
    pickupCountryId: string,
    dropoffCountryId: string | undefined,
    localPickup: boolean,
  ): void {
    if (localPickup || !dropoffCountryId) return;
    if (pickupCountryId !== dropoffCountryId) {
      throw new BadRequestException('Pickup and delivery must be in the same country');
    }
  }

  private walletSpendable(w: { balance: unknown; lockedForTransfers?: unknown | null }): number {
    return Math.round((Number(w.balance) - Number(w.lockedForTransfers ?? 0)) * 100) / 100;
  }

  /** Optional extra on top of calculated price (errand / long service). Same unit as order price. */
  private normalizeCustomerExtraAmount(raw: unknown): number {
    const n = Number(raw ?? 0);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('Invalid extra amount');
    }
    if (n > OrdersService.MAX_CUSTOMER_EXTRA) {
      throw new BadRequestException(`Extra amount cannot exceed ${OrdersService.MAX_CUSTOMER_EXTRA}`);
    }
    return Math.round(n * 100) / 100;
  }

  /**
   * Determine if it's night time (20:00-06:00) in the given country
   */
  private isNightInCountry(isoCode: string): boolean {
    const tz = OrdersService.COUNTRY_TIMEZONES[isoCode] || 'UTC';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    const hour = parseInt(formatter.format(now), 10);
    return hour >= 20 || hour < 6;
  }

  /**
   * Preview order price without creating it.
   * Auto-detects night delivery based on pickup address country timezone.
   */
  async previewOrder(userId: string, dto: PreviewOrderDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
    });
    if (!customer) throw new NotFoundException('Customer profile not found');

    const localPickup = !!dto.localPickupOnly;
    if (localPickup && dto.dropoffAddressId) {
      throw new BadRequestException('Local pickup orders do not use a separate drop-off address');
    }
    if (!localPickup && !dto.dropoffAddressId) {
      throw new BadRequestException('Drop-off address is required unless localPickupOnly is true');
    }

    const pickupAddr = await this.prisma.address.findUnique({
      where: { id: dto.pickupAddressId },
      include: { delegation: { include: { governorate: { include: { country: true } } } } },
    });
    if (!pickupAddr) throw new NotFoundException('Address not found');

    const country = pickupAddr.delegation.governorate.country;
    const orderCountryId = country.id;
    const isNight = this.isNightInCountry(country.isoCode);

    let priceCalc: Awaited<ReturnType<PriceCalculationService['calculatePrice']>>;
    let distance: number;

    if (localPickup) {
      priceCalc = await this.priceCalculationService.calculateLocalPickupOnlyPrice(
        dto.pickupAddressId,
        dto.weight,
        isNight,
      );
      distance = 2;
    } else {
      const dropoffAddr = await this.prisma.address.findUnique({
        where: { id: dto.dropoffAddressId! },
        include: { delegation: { include: { governorate: { include: { country: true } } } } },
      });
      if (!dropoffAddr) throw new NotFoundException('Address not found');
      this.assertSameCountryPickupDropoff(
        orderCountryId,
        dropoffAddr.delegation.governorate.countryId,
        false,
      );
      priceCalc = await this.priceCalculationService.calculatePrice(
        dto.pickupAddressId,
        dto.dropoffAddressId!,
        dto.weight,
        isNight,
      );
      distance = this.priceCalculationService.calculateDistance(
        pickupAddr.latitude!,
        pickupAddr.longitude!,
        dropoffAddr.latitude!,
        dropoffAddr.longitude!,
      );
    }

    const { wallet: orderWallet, codOnly } = await this.walletService.getOrderWalletContext(userId, orderCountryId);
    const walletBalance = orderWallet ? this.walletSpendable(orderWallet) : null;
    const allowedPaymentTypes: Array<'COD' | 'WALLET'> = ['COD'];
    if (orderWallet && !codOnly) allowedPaymentTypes.push('WALLET');

    const extra = this.normalizeCustomerExtraAmount(dto.customerExtraAmount);
    const calculatedPrice = priceCalc.totalPrice;
    const totalPrice = Math.round((calculatedPrice + extra) * 100) / 100;
    const coinsPerFiatUnit = await this.coinConfig.getActiveCoinsPerFiatUnit(country.id);
    const totalPriceCoins = this.coinConfig.fiatToCoins(totalPrice, coinsPerFiatUnit);

    let walletUnavailableReason: 'NO_WALLET' | 'COD_ONLY_PREFERENCE' | 'INSUFFICIENT_BALANCE' | undefined;
    if (!orderWallet) walletUnavailableReason = 'NO_WALLET';
    else if (codOnly) walletUnavailableReason = 'COD_ONLY_PREFERENCE';
    else if (walletBalance !== null && walletBalance < totalPriceCoins) {
      walletUnavailableReason = 'INSUFFICIENT_BALANCE';
    }

    return {
      isNightDelivery: isNight,
      distanceKm: distance,
      localPickupOnly: localPickup,
      deliveryZoneType: priceCalc.deliveryZoneType,
      baseFee: priceCalc.baseFee,
      distanceFee: priceCalc.distanceFee,
      extraWeightFee: priceCalc.extraWeightFee,
      nightFee: priceCalc.nightFee,
      calculatedPrice,
      customerExtraAmount: extra,
      totalPrice,
      totalPriceCoins,
      coinsPerFiatUnit,
      currency: country.currencyCode,
      currencySymbol: country.currencySymbol,
      orderCountryId,
      walletBalance,
      wallet: orderWallet
        ? {
            walletId: orderWallet.id,
            countryId: orderWallet.countryId,
            spendable: walletBalance ?? 0,
            currencyCode: country.currencyCode,
          }
        : null,
      allowedPaymentTypes,
      walletUnavailableReason,
      paymentType: dto.paymentType,
    };
  }

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
    });
    if (!customer) throw new NotFoundException('Customer profile not found');
    if (customer.customerStatus !== CustomerStatus.ACTIVE) {
      throw new ForbiddenException('Only active customers can create orders');
    }

    const localPickup = !!dto.localPickupOnly;
    if (localPickup && dto.dropoffAddressId) {
      throw new BadRequestException('Local pickup orders do not use a separate drop-off address');
    }
    if (!localPickup && !dto.dropoffAddressId) {
      throw new BadRequestException('Drop-off address is required unless localPickupOnly is true');
    }

    const pickupAddr = await this.prisma.address.findUnique({
      where: { id: dto.pickupAddressId },
      include: { delegation: { include: { governorate: { include: { country: true } } } } },
    });
    if (!pickupAddr) throw new NotFoundException('Address not found');

    const orderCountryId = pickupAddr.delegation.governorate.countryId;

    let dropoffAddr: { id: string; latitude: number | null; longitude: number | null; delegation?: { governorate: { countryId: string } } } | null = null;
    if (!localPickup) {
      dropoffAddr = await this.prisma.address.findUnique({
        where: { id: dto.dropoffAddressId! },
        include: { delegation: { include: { governorate: true } } },
      });
      if (!dropoffAddr) throw new NotFoundException('Address not found');
      this.assertSameCountryPickupDropoff(
        orderCountryId,
        dropoffAddr.delegation?.governorate.countryId,
        false,
      );
    }

    const { wallet: orderWallet, codOnly } = await this.walletService.getOrderWalletContext(userId, orderCountryId);

    if (dto.paymentType === PaymentType.WALLET) {
      if (codOnly) {
        throw new BadRequestException('Wallet payment is not available for this country (cash only)');
      }
      if (!orderWallet) {
        throw new BadRequestException('You do not have a digital wallet for this country');
      }
    }

    const isNight = this.isNightInCountry(pickupAddr.delegation.governorate.country.isoCode);

    let priceCalc: Awaited<ReturnType<PriceCalculationService['calculatePrice']>>;
    let distance: number;

    if (localPickup) {
      priceCalc = await this.priceCalculationService.calculateLocalPickupOnlyPrice(
        dto.pickupAddressId,
        dto.weight,
        isNight,
      );
      distance = 2;
    } else {
      priceCalc = await this.priceCalculationService.calculatePrice(
        dto.pickupAddressId,
        dto.dropoffAddressId!,
        dto.weight,
        isNight,
      );
      distance = this.priceCalculationService.calculateDistance(
        pickupAddr.latitude!,
        pickupAddr.longitude!,
        dropoffAddr!.latitude!,
        dropoffAddr!.longitude!,
      );
    }

    const extra = this.normalizeCustomerExtraAmount(dto.customerExtraAmount);
    const calculatedPrice = priceCalc.totalPrice;
    const finalPrice = Math.round((calculatedPrice + extra) * 100) / 100;

    const defaultCancelAfterMinutes = localPickup ? 5 : 15;
    const maxCancelAfterMinutes = localPickup ? 240 : 1440;
    const requestedCancelAfterMinutes = dto.cancelAfterMinutes ?? defaultCancelAfterMinutes;
    if (!Number.isFinite(requestedCancelAfterMinutes) || !Number.isInteger(requestedCancelAfterMinutes)) {
      throw new BadRequestException('Auto-cancel time must be an integer number of minutes');
    }
    if (requestedCancelAfterMinutes > maxCancelAfterMinutes) {
      throw new BadRequestException(
        localPickup
          ? 'Local pickup auto-cancel time must be 240 minutes or less'
          : 'Auto-cancel time must be 1440 minutes or less',
      );
    }
    const shouldAutoCancelImmediately = requestedCancelAfterMinutes <= 0;

    const minLeadMs = 60 * 1000;
    const maxLeadMs = 30 * 24 * 60 * 60 * 1000;
    let scheduledAt: Date | null = null;
    let isScheduled = false;
    if (dto.scheduledPublishAt && !shouldAutoCancelImmediately) {
      scheduledAt = new Date(dto.scheduledPublishAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException('Invalid scheduled publish time');
      }
      const t = scheduledAt.getTime();
      if (t < Date.now() + minLeadMs) {
        throw new BadRequestException('Publish time must be at least one minute from now');
      }
      if (t > Date.now() + maxLeadMs) {
        throw new BadRequestException('Publish time cannot be more than 30 days ahead');
      }
      isScheduled = true;
    }

    const coinsPerFiatUnit = await this.coinConfig.getActiveCoinsPerFiatUnit(orderCountryId);
    let paymentWalletId: string | null = null;
    if (dto.paymentType === PaymentType.WALLET) {
      const w = orderWallet!;
      paymentWalletId = w.id;
      const spendable = this.walletSpendable(w);
      const priceInCoins = this.coinConfig.fiatToCoins(finalPrice, coinsPerFiatUnit);
      if (spendable < priceInCoins) {
        throw new BadRequestException('Insufficient wallet balance');
      }
    }

    const order = await this.prisma.order.create({
      data: {
        customerId: customer.id,
        pricingPolicyId: priceCalc.pricingPolicyId,
        pickupAddressId: dto.pickupAddressId,
        dropoffAddressId: localPickup ? null : dto.dropoffAddressId,
        localPickupOnly: localPickup,
        orderCountryId,
        paymentWalletId,
        status: shouldAutoCancelImmediately
          ? ('AUTO_CANCELLED' as OrderStatus)
          : isScheduled
            ? OrderStatus.PENDING_PUBLISH
            : OrderStatus.SEARCHING_DRIVER,
        scheduledPublishAt: isScheduled && scheduledAt ? scheduledAt : null,
        paymentType: dto.paymentType,
        description: dto.description,
        weight: dto.weight,
        distanceKm: distance,
        price: finalPrice,
        sourceType: OrderSourceType.NORMAL_CUSTOMER,
        customerExtraAmount: extra,
        nightFee: priceCalc.nightFee,
        extraWeightFee: priceCalc.extraWeightFee,
        isNightDelivery: isNight,
        cancelAfterMinutes: requestedCancelAfterMinutes,
        cancelTimerRemainingSeconds: shouldAutoCancelImmediately ? 0 : requestedCancelAfterMinutes * 60,
        cancelTimerLastResumedAt: shouldAutoCancelImmediately ? null : isScheduled ? null : new Date(),
        cancelTimerPausedAt: shouldAutoCancelImmediately ? new Date() : isScheduled ? new Date() : null,
      },
      include: this.orderInclude(),
    });
    if (shouldAutoCancelImmediately) {
      this.eventEmitter.emit('order.no_driver_found', {
        orderId: order.id,
        customerUserId: userId,
      });
    } else if (isScheduled) {
      this.eventEmitter.emit('order.scheduled_publish', {
        orderId: order.id,
        userId,
        pickupGovernorateId: pickupAddr.delegation.governorateId,
        scheduledPublishAt: scheduledAt!.toISOString(),
      });
    } else {
      this.eventEmitter.emit('order.created', {
        orderId: order.id,
        customerId: customer.id,
        userId,
        pickupGovernorateId: pickupAddr.delegation.governorateId,
      });
    }
    return this.mapToResponseDto(order, { viewerIsCustomer: true });
  }

  async changePaymentMethod(orderId: string, userId: string, dto: ChangePaymentMethodDto): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, paymentWallet: true },
    }) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    const allowed: OrderStatus[] = [
      OrderStatus.SEARCHING_DRIVER,
      OrderStatus.PENDING_PUBLISH,
      'PENDING_CUSTOMER_APPROVAL' as any,
      OrderStatus.DRIVER_ASSIGNED,
      OrderStatus.DRIVER_ARRIVED,
    ];
    if (!allowed.includes(order.status)) throw new BadRequestException('Cannot change payment method after pickup');
    let paymentWalletId: string | null = order.paymentWalletId;
    if (dto.paymentType === PaymentType.WALLET) {
      const pickupAddr = await this.prisma.address.findUnique({
        where: { id: order.pickupAddressId },
        include: { delegation: { include: { governorate: true } } },
      });
      const orderCountryId = order.orderCountryId ?? pickupAddr?.delegation.governorate.countryId;
      if (!orderCountryId) throw new BadRequestException('Order country unknown');
      const { wallet: orderWallet, codOnly } = await this.walletService.getOrderWalletContext(userId, orderCountryId);
      if (codOnly || !orderWallet) throw new BadRequestException('No digital wallet for this order country');
      paymentWalletId = orderWallet.id;
      const spendable = this.walletSpendable(orderWallet);
      const coinsPerFiatUnit = await this.coinConfig.getActiveCoinsPerFiatUnit(orderCountryId);
      const priceInCoins = this.coinConfig.fiatToCoins(Number(order.price), coinsPerFiatUnit);
      if (spendable < priceInCoins) throw new BadRequestException('Insufficient wallet balance');
    } else {
      paymentWalletId = null;
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentType: dto.paymentType, paymentWalletId },
      include: this.orderInclude(),
    });
    return this.mapToResponseDto(updated, { viewerIsCustomer: true });
  }

  async updateScheduledPublishAt(orderId: string, userId: string, scheduledPublishAtIso: string): Promise<OrderResponseDto> {
    const order = (await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        pickupAddress: { include: { delegation: true } },
      },
    })) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.PENDING_PUBLISH) {
      throw new BadRequestException('Schedule can only be changed while the order is waiting to go live');
    }

    const scheduledAt = new Date(scheduledPublishAtIso);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled publish time');
    }
    const minLeadMs = 60 * 1000;
    const maxLeadMs = 30 * 24 * 60 * 60 * 1000;
    const t = scheduledAt.getTime();
    if (t < Date.now() + minLeadMs) {
      throw new BadRequestException('Publish time must be at least one minute from now');
    }
    if (t > Date.now() + maxLeadMs) {
      throw new BadRequestException('Publish time cannot be more than 30 days ahead');
    }

    const pickupGovernorateId = order.pickupAddress?.delegation?.governorateId;
    if (!pickupGovernorateId) {
      throw new BadRequestException('Order is missing pickup location');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { scheduledPublishAt: scheduledAt },
      include: this.orderInclude(),
    });

    this.eventEmitter.emit('order.scheduled_publish', {
      orderId: order.id,
      userId,
      pickupGovernorateId,
      scheduledPublishAt: scheduledAt.toISOString(),
    });

    return this.mapToResponseDto(updated, { viewerIsCustomer: true });
  }

  async updateCancelAfterMinutes(orderId: string, userId: string, cancelAfterMinutes: number): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    }) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (
      ![
        OrderStatus.SEARCHING_DRIVER,
        OrderStatus.PENDING_PUBLISH,
        'PENDING_CUSTOMER_APPROVAL' as any,
        OrderStatus.DRIVER_ASSIGNED,
      ].includes(order.status)
    ) {
      throw new BadRequestException('Cancel timer can only be changed before pickup');
    }
    if (order.localPickupOnly) {
      if (cancelAfterMinutes > 240) {
        throw new BadRequestException('Local pickup auto-cancel time must be 240 minutes or less');
      }
    } else if (cancelAfterMinutes > 1440) {
      throw new BadRequestException('Auto-cancel time must be 1440 minutes or less');
    }
    const currentRemaining = this.computeCancelRemainingSeconds(order);
    const currentCancelMinutes = order.cancelAfterMinutes ?? 15;
    const nextRemaining = Math.max(0, currentRemaining + ((cancelAfterMinutes - currentCancelMinutes) * 60));
    const now = new Date();
    const shouldAutoCancelNow =
      (order.status === OrderStatus.SEARCHING_DRIVER || order.status === OrderStatus.PENDING_PUBLISH) &&
      nextRemaining <= 0;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: shouldAutoCancelNow
          ? {
              status: 'AUTO_CANCELLED' as OrderStatus,
              cancelAfterMinutes,
              cancelTimerRemainingSeconds: 0,
              cancelTimerLastResumedAt: null,
              cancelTimerPausedAt: now,
            }
          : order.status === OrderStatus.PENDING_PUBLISH
            ? {
                cancelAfterMinutes,
                cancelTimerRemainingSeconds: nextRemaining,
                cancelTimerLastResumedAt: null,
                cancelTimerPausedAt: order.cancelTimerPausedAt ?? now,
              }
            : {
                cancelAfterMinutes,
                cancelTimerRemainingSeconds: nextRemaining,
                cancelTimerLastResumedAt: order.status === OrderStatus.SEARCHING_DRIVER ? now : null,
                cancelTimerPausedAt: order.status === OrderStatus.SEARCHING_DRIVER ? null : (order.cancelTimerPausedAt ?? now),
              },
        include: this.orderInclude(),
      });
      if (shouldAutoCancelNow) {
        await this.restoreCompanyOrderBudgetOnTerminalStatus(tx, order, 'AUTO_CANCELLED');
      }
      return row;
    });
    if (shouldAutoCancelNow) {
      this.eventEmitter.emit('order.no_driver_found', {
        orderId,
        customerUserId: userId,
      });
    }
    return this.mapToResponseDto(updated, { viewerIsCustomer: true });
  }

  async getOrderById(orderId: string, userId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: this.orderInclude() }) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.SEARCHING_DRIVER && this.computeCancelRemainingSeconds(order) <= 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'AUTO_CANCELLED' as OrderStatus,
            cancelTimerRemainingSeconds: 0,
            cancelTimerLastResumedAt: null,
            cancelTimerPausedAt: new Date(),
          },
        });
        await this.restoreCompanyOrderBudgetOnTerminalStatus(tx, order, 'AUTO_CANCELLED');
      });
      this.eventEmitter.emit('order.no_driver_found', { orderId, customerUserId: order.customer.userId });
      const refreshed = await this.prisma.order.findUnique({ where: { id: orderId }, include: this.orderInclude() }) as any;
      if (!refreshed) throw new NotFoundException('Order not found');
      return this.mapToResponseDto(refreshed, { viewerUserId: userId, viewerIsCustomer: refreshed.customer?.userId === userId });
    }
    const isCustomer = order.customer?.userId === userId;
    const isDriver = order.driverAssignment?.driver?.userId === userId;
    const isConflictDriver = order.arrivalConflict?.driver?.userId === userId;
    if (!isCustomer && !isDriver && !isConflictDriver) throw new ForbiddenException('No access to this order');
    const dto = this.mapToResponseDto(order, {
      viewerUserId: userId,
      viewerIsCustomer: isCustomer,
    });
    const driverIdForRejection =
      order.driverAssignment?.driverId ?? (isConflictDriver ? order.arrivalConflict?.driverId : null);
    if (driverIdForRejection && (isDriver || isConflictDriver)) {
      const rej = await this.prisma.orderDriverRejection.findUnique({
        where: { orderId_driverId: { orderId, driverId: driverIdForRejection } },
      });
      dto.myOrderDriverRejection = rej
        ? {
            id: rej.id,
            reason: rej.reason,
            driverResponse: rej.driverResponse ?? null,
            driverRespondedAt: rej.driverRespondedAt ?? null,
          }
        : null;
    } else {
      dto.myOrderDriverRejection = null;
    }
    if (isCustomer && order.pickupAddress && order.status === OrderStatus.SEARCHING_DRIVER) {
      dto.driverAvailability = await this.computeDriverAvailabilitySummary(
        order.pickupAddress.delegationId,
        order.pickupAddress.delegation.governorateId,
      );
      dto.urgentNotify = this.buildUrgentNotifySummary(order);
    }
    if (isDriver && order.pricingPolicy && order.pickupAddress?.delegation?.governorate?.countryId) {
      const rate = await this.coinConfig.getActiveCoinsPerFiatUnit(
        order.pickupAddress.delegation.governorate.countryId,
      );
      const baseFeeFiat = Number(order.pricingPolicy.baseFee);
      const platformFeeFiat = Number(order.pricingPolicy.platformFee);
      dto.driverFeeBreakdown = {
        totalPriceCoins: this.coinConfig.fiatToCoins(Number(order.price), rate),
        baseFeeCoins: this.coinConfig.fiatToCoins(baseFeeFiat, rate),
        platformFeeCoins: this.coinConfig.fiatToCoins(platformFeeFiat, rate),
      };
    }
    return dto;
  }

  /**
   * Pay referrer from `referral_commission` when eligible; otherwise platform keeps full `base_fee`.
   * Invariant: base_fee = platform_fee + referral_commission (pricing policy).
   */
  private async payReferralCommissionIfEligible(
    tx: any,
    order: {
      id: string;
      customerId: string;
      sourceType: OrderSourceType;
      pricingPolicy: { baseFee: unknown; platformFee: unknown } | null;
      customer: { referredByCode?: { id: string; ownerId: string } | null };
    },
    coinsPerFiatUnit: number | null,
  ): Promise<
    | { paid: false }
    | { paid: true; referrerUserId: string; commissionCoins: number; orderId: string }
  > {
    if (!order.pricingPolicy || !order.customer.referredByCode?.ownerId) return { paid: false };
    const existing = await tx.referralCommission.findFirst({ where: { orderId: order.id } });
    if (existing) return { paid: false };

    const baseFeeFiat = Number(order.pricingPolicy.baseFee);
    const platformFeeFiat = Number(order.pricingPolicy.platformFee);
    const referralFiat = Math.round((baseFeeFiat - platformFeeFiat) * 100) / 100;
    if (!Number.isFinite(referralFiat) || referralFiat <= 0) return { paid: false };

    const multiplier = order.sourceType === OrderSourceType.DELIVERY_COMPANY ? 0.5 : 1;
    const commissionFiat = Math.round(referralFiat * multiplier * 100) / 100;
    const commissionCoins = this.coinConfig.fiatToCoins(commissionFiat, coinsPerFiatUnit);

    const referrerCustomer = await tx.customer.findUnique({
      where: { id: order.customer.referredByCode.ownerId },
      select: { userId: true, primaryWalletId: true },
    });
    if (!referrerCustomer) return { paid: false };

    await tx.referralCommission.create({
      data: {
        referralCodeId: order.customer.referredByCode.id,
        referrerCustomerId: order.customer.referredByCode.ownerId,
        referredCustomerId: order.customerId,
        orderId: order.id,
        commissionAmount: commissionFiat,
        status: ReferralCommissionStatus.PAID,
      },
    });

    const rw = referrerCustomer.primaryWalletId
      ? await tx.digitalWallet.findUnique({ where: { id: referrerCustomer.primaryWalletId } })
      : await tx.digitalWallet.findFirst({
          where: { customerId: order.customer.referredByCode.ownerId },
          orderBy: { updatedAt: 'asc' },
        });
    if (rw) {
      const nbl = Number(rw.balance) + commissionCoins;
      await tx.digitalWallet.update({ where: { id: rw.id }, data: { balance: nbl } });
      await tx.walletTransaction.create({
        data: {
          walletId: rw.id,
          orderId: order.id,
          type: WalletTransactionType.REFERRAL_REWARD,
          amount: commissionCoins,
          status: TransactionStatus.SUCCESS,
          referenceId: order.id,
          referenceType: ReferenceType.REFERRAL,
          balanceAfter: nbl,
        },
      });
    }
    return {
      paid: true,
      referrerUserId: referrerCustomer.userId,
      commissionCoins,
      orderId: order.id,
    };
  }

  async getCustomerOrders(userId: string): Promise<OrderResponseDto[]> {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Customer profile not found');
    const orders = await this.prisma.order.findMany({ where: { customerId: customer.id }, include: this.orderInclude(), orderBy: { createdAt: 'desc' } });
    const expired = orders.filter((o: any) => o.status === OrderStatus.SEARCHING_DRIVER && this.computeCancelRemainingSeconds(o) <= 0);
    if (expired.length > 0) {
      for (const order of expired) {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'AUTO_CANCELLED' as OrderStatus,
              cancelTimerRemainingSeconds: 0,
              cancelTimerLastResumedAt: null,
              cancelTimerPausedAt: new Date(),
            },
          });
          await this.restoreCompanyOrderBudgetOnTerminalStatus(tx, order, 'AUTO_CANCELLED');
        });
        this.eventEmitter.emit('order.no_driver_found', { orderId: order.id, customerUserId: userId });
      }
    }
    const refreshedOrders = expired.length > 0
      ? await this.prisma.order.findMany({ where: { customerId: customer.id }, include: this.orderInclude(), orderBy: { createdAt: 'desc' } })
      : orders;
    return refreshedOrders.map((o: any) => this.mapToResponseDto(o, { viewerIsCustomer: true }));
  }

  async getDriverOrders(driverId: string): Promise<OrderResponseDto[]> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
    const viewerUserId = driver?.userId;
    const orders = await this.prisma.order.findMany({ where: { driverAssignment: { driverId } }, include: this.orderInclude(), orderBy: { createdAt: 'desc' } });
    if (orders.length === 0) return [];
    const rejections = await this.prisma.orderDriverRejection.findMany({
      where: { driverId, orderId: { in: orders.map((o: any) => o.id) } },
    });
    const rejByOrder = new Map(rejections.map((r) => [r.orderId, r]));
    return orders.map((o: any) => {
      const dto = this.mapToResponseDto(o, viewerUserId ? { viewerUserId } : undefined);
      const rej = rejByOrder.get(o.id);
      dto.myOrderDriverRejection = rej
        ? {
            id: rej.id,
            reason: rej.reason,
            driverResponse: rej.driverResponse ?? null,
            driverRespondedAt: rej.driverRespondedAt ?? null,
          }
        : null;
      return dto;
    });
  }

  async cancelOrder(orderId: string, userId: string, reason: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (
      order.status !== OrderStatus.SEARCHING_DRIVER &&
      order.status !== OrderStatus.DRAFT &&
      order.status !== OrderStatus.PENDING_PUBLISH
    ) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
      await this.restoreCompanyOrderBudgetOnTerminalStatus(tx, order, 'CANCELLED');
    });
    await this.closeChatRoomForOrder(orderId);
    this.eventEmitter.emit('order.cancelled', {
      orderId,
      customerUserId: userId,
      reason,
    });
    // Close related support tickets
    await this.prisma.supportTicket.updateMany({
      where: {
        userId,
        description: { contains: orderId },
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      data: { status: 'CLOSED', resolvedAt: new Date() },
    });
  }

  async reactivateOrder(orderId: string, userId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    }) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (!['CANCELLED', 'AUTO_CANCELLED'].includes(order.status)) {
      throw new BadRequestException('Only cancelled orders can be reactivated');
    }
    const defaultCancelAfterMinutes = order.localPickupOnly ? 5 : 15;
    const restartMinutes = Math.max(1, Number(order.cancelAfterMinutes ?? defaultCancelAfterMinutes));
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SEARCHING_DRIVER,
        cancelAfterMinutes: restartMinutes,
        cancelTimerRemainingSeconds: restartMinutes * 60,
        cancelTimerLastResumedAt: new Date(),
        cancelTimerPausedAt: null,
      },
      include: this.orderInclude(),
    });
    this.eventEmitter.emit('order.created', {
      orderId: updated.id,
      customerId: updated.customerId,
      userId,
      pickupGovernorateId: updated.pickupAddress?.delegation?.governorateId,
    });
    return this.mapToResponseDto(updated, { viewerIsCustomer: true });
  }

  async completeOrder(orderId: string, driverId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { include: { referredByCode: true, user: true } },
        paymentWallet: true,
        driverAssignment: {
          include: {
            driver: {
              include: {
                user: true,
              },
            },
          },
        },
        pricingPolicy: true,
        pickupAddress: { include: { delegation: { include: { governorate: true } } } },
      },
    }) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (!order.driverAssignment || order.driverAssignment.driverId !== driverId) {
      throw new ForbiddenException('Not your assigned order');
    }
    if (order.status !== OrderStatus.DELIVERING) {
      throw new BadRequestException('Order must be in DELIVERING status');
    }

    const expiryMinutes = await this.getTrackingExpiryMinutes();
    const trackingExpiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    const countryId = order.pickupAddress?.delegation?.governorate?.countryId as string | undefined;
    const coinsPerFiatUnit = countryId
      ? await this.coinConfig.getActiveCoinsPerFiatUnit(countryId)
      : null;

    type ReferralPayoutInfo = { referrerUserId: string; commissionCoins: number; orderId: string };
    const referralPayouts: ReferralPayoutInfo[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED, trackingExpiresAt }, include: this.orderInclude() });      await tx.driverAssignment.update({ where: { orderId }, data: { deliveredAt: new Date() } });
      await tx.customer.update({ where: { id: order.customerId }, data: { completedOrders: { increment: 1 } } });

      const baseFeeFiat = order.pricingPolicy ? Number(order.pricingPolicy.baseFee) : 0;
      const platformFeeFiat = order.pricingPolicy ? Number(order.pricingPolicy.platformFee) : 0;
      const baseFeeCoins = this.coinConfig.fiatToCoins(baseFeeFiat, coinsPerFiatUnit);

      const referralResult = await this.payReferralCommissionIfEligible(tx, order, coinsPerFiatUnit);
      if (referralResult.paid) {
        referralPayouts.push({
          referrerUserId: referralResult.referrerUserId,
          commissionCoins: referralResult.commissionCoins,
          orderId: referralResult.orderId,
        });
      }

      if (order.paymentType === PaymentType.COD) {
        const cash = Number(order.price);
        const platformShareFiat = referralResult.paid ? platformFeeFiat : baseFeeFiat;
        await tx.cashTransaction.create({
          data: {
            orderId,
            driverId: order.driverAssignment.driverId,
            cashCollected: cash,
            platformFee: platformShareFiat,
            driverNet: Math.round((cash - baseFeeFiat) * 100) / 100,
          },
        });

        const driverAccount = await tx.driverAccount.findUnique({
          where: { driverId: order.driverAssignment.driverId },
        });
        if (driverAccount && baseFeeCoins > 0) {
          const oldBalance = Number(driverAccount.balance);
          const newBalance = Math.round((oldBalance - baseFeeCoins) * 100) / 100;
          const updateData: any = { balance: newBalance };
          if (newBalance < 0 && oldBalance >= 0) {
            updateData.negativeBalanceSince = new Date();
          }
          await tx.driverAccount.update({ where: { id: driverAccount.id }, data: updateData });
          await tx.driverTransaction.create({
            data: {
              accountId: driverAccount.id,
              type: 'PLATFORM_FEE',
              amount: -baseFeeCoins,
              referenceId: orderId,
              referenceType: 'ORDER',
              description: `COD order #${orderId.slice(0, 8)} — base fee (platform share, coins)`,
              balanceAfter: newBalance,
            },
          });
        }
      } else if (order.paymentType === PaymentType.WALLET && order.sourceType !== OrderSourceType.DELIVERY_COMPANY) {
        let payWallet = order.paymentWallet as { id: string; balance: unknown } | null;
        if (!payWallet && order.paymentWalletId) {
          payWallet = await tx.digitalWallet.findUnique({ where: { id: order.paymentWalletId } });
        }
        if (!payWallet && order.orderCountryId) {
          payWallet = await tx.digitalWallet.findUnique({
            where: {
              customerId_countryId: { customerId: order.customerId, countryId: order.orderCountryId },
            },
          });
        }
        if (!payWallet) {
          throw new BadRequestException('Payment wallet not found for this order');
        }
        const priceCoins = this.coinConfig.fiatToCoins(Number(order.price), coinsPerFiatUnit);
        const nb = Number(payWallet.balance) - priceCoins;
        await tx.digitalWallet.update({ where: { id: payWallet.id }, data: { balance: nb } });
        await tx.walletTransaction.create({
          data: {
            walletId: payWallet.id,
            orderId,
            type: WalletTransactionType.ORDER_PAYMENT,
            amount: -priceCoins,
            status: TransactionStatus.SUCCESS,
            referenceId: orderId,
            referenceType: ReferenceType.ORDER,
            balanceAfter: nb,
          },
        });

        const driverNet = Math.round((priceCoins - baseFeeCoins) * 100) / 100;
        if (driverNet !== 0) {
          const driverAccount = await tx.driverAccount.findUnique({
            where: { driverId: order.driverAssignment.driverId },
          });
          if (driverAccount) {
            const oldBalance = Number(driverAccount.balance);
            const newBalance = oldBalance + driverNet;
            await tx.driverAccount.update({
              where: { id: driverAccount.id },
              data: {
                balance: newBalance,
                ...(newBalance < 0 && oldBalance >= 0 ? { negativeBalanceSince: new Date() } : {}),
              },
            });
            await tx.driverTransaction.create({
              data: {
                accountId: driverAccount.id,
                type: DriverTransactionType.ADJUSTMENT,
                amount: driverNet,
                referenceId: orderId,
                referenceType: 'ORDER',
                description: `Wallet order #${orderId.slice(0, 8)} — payout (price − base fee, coins)`,
                balanceAfter: newBalance,
              },
            });
          }
        }
      }

      await tx.driverPerformanceMetrics.updateMany({ where: { driverId: order.driverAssignment.driverId }, data: { totalOrders: { increment: 1 }, completedOrders: { increment: 1 }, lastCalculatedAt: new Date() } });
      await tx.driverAccount.updateMany({ where: { driverId: order.driverAssignment.driverId }, data: { completedDeliveries: { increment: 1 } } });

      if (order.deliveryCompanyId) {
        const reserve = Math.round(Number(order.price) * 0.5 * 100) / 100;
        const deptId = order.deliveryCompanyDepartmentId;
        if (deptId) {
          const txAny = tx as any;
          const wallet = await txAny.deliveryCompanyDepartmentBudgetWallet.findUnique({
            where: { departmentId: deptId },
          });
          if (wallet) {
            /** Delivered: department pays only `order_price`; release `order_return_price` (½ price) back to available. */
            const nextAvail = Math.round((Number(wallet.availableCoins) + reserve) * 100) / 100;
            await txAny.deliveryCompanyDepartmentBudgetWallet.update({
              where: { departmentId: deptId },
              data: { availableCoins: nextAvail },
            });
          }
        } else {
          const company = await tx.deliveryCompany.findUnique({ where: { id: order.deliveryCompanyId } });
          if (company) {
            /**
             * Main-company wallet: placement debited `price` from coinBalance and added `reserve` (½ price) to lockedCoins
             * for capacity. Delivered final settlement is net **1× price** — release the reserve from locked only
             * (do not credit coinBalance: the reserve was never deducted from coinBalance at placement).
             */
            const unlock = Math.min(Number(company.lockedCoins), reserve);
            const nextLocked = Math.max(0, Number(company.lockedCoins) - unlock);
            await tx.deliveryCompany.update({
              where: { id: company.id },
              data: { lockedCoins: nextLocked },
            });
          }
        }
        if (order.sourceType === OrderSourceType.DELIVERY_COMPANY && order.paymentType === PaymentType.WALLET && order.pricingPolicy) {
          const priceCoins = this.coinConfig.fiatToCoins(Number(order.price), coinsPerFiatUnit);
          const driverNet = Math.round((priceCoins - baseFeeCoins) * 100) / 100;
          if (driverNet !== 0) {
            const dAcc = await tx.driverAccount.findUnique({ where: { driverId: order.driverAssignment.driverId } });
            if (dAcc) {
              const ob = Number(dAcc.balance);
              const nb = ob + driverNet;
              await tx.driverAccount.update({
                where: { id: dAcc.id },
                data: { balance: nb, ...(nb < 0 && ob >= 0 ? { negativeBalanceSince: new Date() } : {}) },
              });
              await tx.driverTransaction.create({
                data: {
                  accountId: dAcc.id,
                  type: DriverTransactionType.ADJUSTMENT,
                  amount: driverNet,
                  referenceId: orderId,
                  referenceType: 'ORDER',
                  description: `Company wallet order #${orderId.slice(0, 8)} — delivery payout (price − platform fee)`,
                  balanceAfter: nb,
                },
              });
            }
          }
        }
      }

      // Recalculate performance metrics
      const metrics = await tx.driverPerformanceMetrics.findUnique({ where: { driverId: order.driverAssignment.driverId } });
      if (metrics) {
        const completionRate = metrics.totalOrders > 0 ? (metrics.completedOrders / metrics.totalOrders) * 100 : 0;

        // Calculate avg delivery time from all completed assignments
        const completedAssignments = await tx.driverAssignment.findMany({
          where: { driverId: order.driverAssignment.driverId, acceptedAt: { not: null }, deliveredAt: { not: null } },
          select: { acceptedAt: true, deliveredAt: true },
        });
        let avgDeliveryTimeMinutes: number | null = null;
        if (completedAssignments.length > 0) {
          const totalMinutes = completedAssignments.reduce((sum, a) => {
            return sum + (new Date(a.deliveredAt!).getTime() - new Date(a.acceptedAt!).getTime()) / 60000;
          }, 0);
          avgDeliveryTimeMinutes = Math.round(totalMinutes / completedAssignments.length);
        }

        await tx.driverPerformanceMetrics.update({
          where: { driverId: order.driverAssignment.driverId },
          data: { completionRate, avgDeliveryTimeMinutes, lastCalculatedAt: new Date() },
        });
      }

      // Close chat room on delivery
      await tx.chatRoom.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'CLOSED' } });

      // Close support tickets related to this order (customer-CS conversation)
      await tx.supportTicket.updateMany({
        where: {
          userId: order.customer.userId,
          description: { contains: orderId },
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        data: { status: 'CLOSED', resolvedAt: new Date() },
      });

      return updatedOrder;
    });
    this.eventEmitter.emit('order.delivered', {
      orderId,
      customerUserId: order.customer.userId,
      driverUserId: order.driverAssignment.driver.userId,
    });
    for (const payout of referralPayouts) {
      this.eventEmitter.emit('referral.commission_paid', payout);
    }
    return this.mapToResponseDto(result as any, { viewerUserId: order.driverAssignment.driver.userId });
  }

  async updateOrderStatus(
    orderId: string,
    driverId: string,
    newStatus: OrderStatus,
    opts?: { customerCallCountBeforeReturn?: number; returnEvidenceImageUrl?: string },
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        driverAssignment: { include: { driver: { select: { userId: true } } } },
        pricingPolicy: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.driverAssignment || order.driverAssignment.driverId !== driverId) throw new ForbiddenException('Not your order');
    const valid: Record<string, OrderStatus[]> = {
      DRIVER_ASSIGNED: [OrderStatus.DRIVER_ARRIVED], DRIVER_ARRIVED: [OrderStatus.PICKED_UP],
      PICKED_UP: [OrderStatus.DELIVERING], DELIVERING: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
      RETURNED: [OrderStatus.RETURN_DEPOSIT],
    };
    if (!(valid[order.status] || []).includes(newStatus)) throw new BadRequestException(`Cannot transition from ${order.status} to ${newStatus}`);
    if (newStatus === OrderStatus.DELIVERED) {
      // Proof image 1 is required before marking as delivered
      if (!order.driverAssignment.image1Proof) {
        throw new BadRequestException('You must upload at least the first proof image before marking the order as delivered');
      }
      return this.completeOrder(orderId, driverId);
    }
    if (newStatus === OrderStatus.RETURNED || newStatus === OrderStatus.RETURN_DEPOSIT) {
      if (newStatus === OrderStatus.RETURNED && !order.driverAssignment.image1Proof) {
        throw new BadRequestException('You must upload at least the first proof image before marking the order as returned');
      }
      const assignData: any = {};
      if (opts?.customerCallCountBeforeReturn !== undefined && opts.customerCallCountBeforeReturn !== null) {
        assignData.customerCallCountBeforeReturn = opts.customerCallCountBeforeReturn;
      }
      if (opts?.returnEvidenceImageUrl !== undefined && String(opts.returnEvidenceImageUrl || '').trim()) {
        assignData.returnEvidenceImageUrl = String(opts.returnEvidenceImageUrl).trim();
      }
      if (Object.keys(assignData).length > 0) {
        await this.prisma.driverAssignment.update({ where: { orderId }, data: assignData });
      }
    }
    if (newStatus === OrderStatus.DRIVER_ARRIVED) await this.prisma.driverAssignment.update({ where: { orderId }, data: { arrivedAt: new Date() } });
    else if (newStatus === OrderStatus.PICKED_UP) await this.prisma.driverAssignment.update({ where: { orderId }, data: { pickedUpAt: new Date() } });
    else if (newStatus === OrderStatus.RETURN_DEPOSIT && order.deliveryCompanyId) {
      await this.prisma.$transaction(async (tx) => {
        const price = Number(order.price);
        const reserve = Math.round(price * 0.5 * 100) / 100;
        const pFee = order.pricingPolicy ? Number(order.pricingPolicy.platformFee) : 0;
        const gross = Math.round(price * 1.5 * 100) / 100;
        const net = Math.round((gross - pFee) * 100) / 100;

        /**
         * Department wallet: order creation already debited `price + returnReserve` (1.5×) from `availableCoins`.
         * Return-deposit charges the full 1.5× — no extra department wallet mutation here.
         */
        if (!order.deliveryCompanyDepartmentId && gross > 0) {
          const company = await tx.deliveryCompany.findUnique({ where: { id: order.deliveryCompanyId! } });
          if (company) {
            let locked = Number(company.lockedCoins);
            const takeLocked = Math.min(locked, reserve);
            locked -= takeLocked;
            /** Placement already debited 1× price; return-deposit path owes **1.5×** total — debit the extra ½× here. */
            const returnSurcharge = Math.round((gross - price) * 100) / 100;
            const nextBal = Math.round((Number(company.coinBalance) - returnSurcharge) * 100) / 100;
            await tx.deliveryCompany.update({
              where: { id: company.id },
              data: {
                lockedCoins: Math.max(0, Math.round(locked * 100) / 100),
                coinBalance: nextBal,
              },
            });
            if (returnSurcharge > 0) {
              await tx.deliveryCompanyTransaction.create({
                data: {
                  deliveryCompanyId: company.id,
                  orderId,
                  type: DeliveryCompanyTransactionType.RETURN_SURCHARGE,
                  amount: -returnSurcharge,
                  balanceAfter: nextBal,
                  description: `Return-deposit settlement (additional 50% of order price) order #${orderId.slice(0, 8)}`,
                },
              });
            }
          }
        }

        if (
          order.sourceType === OrderSourceType.DELIVERY_COMPANY &&
          order.paymentType === PaymentType.WALLET &&
          order.driverAssignment &&
          order.pricingPolicy
        ) {
          const drvId = order.driverAssignment.driverId;
          const acc = await tx.driverAccount.findUnique({ where: { driverId: drvId } });
          if (acc && net !== 0) {
            const oldB = Number(acc.balance);
            let bal = oldB;
            bal = Math.round((bal + gross) * 100) / 100;
            await tx.driverTransaction.create({
              data: {
                accountId: acc.id,
                type: DriverTransactionType.ADJUSTMENT,
                amount: gross,
                referenceId: orderId,
                referenceType: 'ORDER',
                description: `Return-deposit payout (price + 50%) order #${orderId.slice(0, 8)}`,
                balanceAfter: bal,
              },
            });
            if (pFee !== 0) {
              bal = Math.round((bal - pFee) * 100) / 100;
              await tx.driverTransaction.create({
                data: {
                  accountId: acc.id,
                  type: DriverTransactionType.PLATFORM_FEE,
                  amount: -pFee,
                  referenceId: orderId,
                  referenceType: 'ORDER',
                  description: `Platform fee on return-deposit order #${orderId.slice(0, 8)}`,
                  balanceAfter: bal,
                },
              });
            }
            await tx.driverAccount.update({
              where: { id: acc.id },
              data: {
                balance: bal,
                ...(bal < 0 && oldB >= 0 ? { negativeBalanceSince: new Date() } : {}),
              },
            });
          }
        }
      });
    }

    // Generate tracking token when order is picked up
    const orderUpdateData: any = { status: newStatus };
    if (newStatus === OrderStatus.PICKED_UP) {
      orderUpdateData.trackingToken = this.generateTrackingToken();
    }
    if (newStatus === OrderStatus.DRIVER_ARRIVED) {
      Object.assign(orderUpdateData, this.buildPausedTimerUpdate(order));
    }
    const updated = await this.prisma.order.update({ where: { id: orderId }, data: orderUpdateData, include: this.orderInclude() });
    if (newStatus === OrderStatus.RETURN_DEPOSIT) {
      await this.closeChatRoomForOrder(orderId);
    }
    if (updated.sourceType === OrderSourceType.DELIVERY_COMPANY && updated.deliveryCompanyId) {
      const refreshTargets = [updated.deliveryCompanyDepartmentId, updated.deliveryCompanyId].filter(
        (id, i, arr) => id && arr.indexOf(id) === i,
      ) as string[];
      this.notificationsGateway.emitOrderUpdated(refreshTargets, updated.id, String(updated.status));
    }
    // Emit status change events for notifications
    const customerUserId = (updated as any).customer?.userId;
    const statusEventMap: Record<string, string> = {
      DRIVER_ARRIVED: 'order.driver_arrived',
      PICKED_UP: 'order.picked_up',
      DELIVERING: 'order.delivering',
      RETURNED: 'order.returned',
      RETURN_DEPOSIT: 'order.return_deposit',
    };
    const eventName = statusEventMap[newStatus];
    const driverUserId = order.driverAssignment?.driver?.userId;
    if (eventName && customerUserId) {
      this.eventEmitter.emit(eventName, { orderId, customerUserId, driverUserId });
    }

    const viewerUserId = (updated as any).driverAssignment?.driver?.user?.id as string | undefined;
    return this.mapToResponseDto(updated as any, viewerUserId ? { viewerUserId } : undefined);
  }

  async uploadProofs(orderId: string, driverId: string, image1Proof?: string, image2Proof?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { driverAssignment: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.driverAssignment || order.driverAssignment.driverId !== driverId) throw new ForbiddenException('Not your order');

    // Build update data — only update fields that are provided
    const updateData: any = {};
    if (image1Proof) updateData.image1Proof = image1Proof;
    if (image2Proof) updateData.image2Proof = image2Proof;

    // If no image1 exists and none provided, require it
    if (!order.driverAssignment.image1Proof && !image1Proof) {
      throw new BadRequestException('First proof image is required');
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No new images to upload');
    }

    return this.prisma.driverAssignment.update({ where: { orderId }, data: updateData });
  }

  async getDriverLocation(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    const active: OrderStatus[] = [
      OrderStatus.PENDING_CUSTOMER_APPROVAL,
      OrderStatus.DRIVER_ASSIGNED,
      OrderStatus.DRIVER_ARRIVED,
      OrderStatus.PICKED_UP,
      OrderStatus.DELIVERING,
    ];
    if (order.status === OrderStatus.DELIVERED) {
      return this.prisma.driverLocation.findFirst({ where: { orderId }, orderBy: { timestamp: 'desc' } });
    }
    if (!active.includes(order.status)) throw new BadRequestException('Driver location not available');
    return this.prisma.driverLocation.findFirst({ where: { orderId }, orderBy: { timestamp: 'desc' } });
  }

  async updateDriverLocation(orderId: string, driverId: string, lat: number, lng: number, accuracy?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { driverAssignment: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.driverAssignment || order.driverAssignment.driverId !== driverId) throw new ForbiddenException('Not your order');
    return this.prisma.driverLocation.create({ data: { driverId, orderId, latitude: lat, longitude: lng, accuracy } });
  }

  /** Customer gets their order's tracking token (only during PICKED_UP/DELIVERING) */
  async getTrackingInfo(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    const trackable: OrderStatus[] = [OrderStatus.PICKED_UP, OrderStatus.DELIVERING];
    if (!trackable.includes(order.status)) throw new BadRequestException('Tracking is only available when order is picked up or delivering');
    if (!order.trackingToken) throw new BadRequestException('Tracking token not yet generated');
    return { trackingToken: order.trackingToken };
  }

  /** Public endpoint — anyone with the token can see driver location */
  async getPublicTracking(token: string) {
    const order = await this.prisma.order.findUnique({
      where: { trackingToken: token },
      include: {
        pickupAddress: { include: { delegation: { include: { governorate: true } } } },
        dropoffAddress: { include: { delegation: { include: { governorate: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Invalid tracking token');

    const trackable: OrderStatus[] = [
      OrderStatus.DRIVER_ARRIVED,
      OrderStatus.PICKED_UP,
      OrderStatus.DELIVERING,
    ];
    const isExpired = order.trackingExpiresAt && order.trackingExpiresAt < new Date();

    if (!trackable.includes(order.status) && !isExpired) {
      throw new BadRequestException('Tracking is not active for this order');
    }
    if (isExpired && !trackable.includes(order.status)) {
      throw new BadRequestException('Tracking link has expired');
    }

    const driverLocation = await this.prisma.driverLocation.findFirst({
      where: { orderId: order.id },
      orderBy: { timestamp: 'desc' },
    });

    return {
      status: order.status,
      driverLocation: driverLocation ? {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        timestamp: driverLocation.timestamp,
      } : null,
      pickupAddress: order.pickupAddress
        ? {
            street: order.pickupAddress.street,
            latitude: order.pickupAddress.latitude,
            longitude: order.pickupAddress.longitude,
            delegation: order.pickupAddress.delegation?.nameDelegation,
            governorate: order.pickupAddress.delegation?.governorate?.nameGovernorate,
          }
        : null,
      dropoffAddress: order.dropoffAddress ? {
        street: order.dropoffAddress.street,
        latitude: order.dropoffAddress.latitude,
        longitude: order.dropoffAddress.longitude,
        delegation: order.dropoffAddress.delegation?.nameDelegation,
        governorate: order.dropoffAddress.delegation?.governorate?.nameGovernorate,
      } : null,
    };
  }

  async createDispute(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, dispute: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.dispute) throw new BadRequestException('Dispute already exists');

    // Find an available CS agent to auto-assign
    const csAgent = await this.prisma.customerService.findFirst({
      where: { superUser: { status: 'ACTIVE' } },
    });

    return this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: {
          orderId,
          reportedBy: order.customerId,
          reason,
          assignedTo: csAgent?.id || null,
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.DISPUTED } });

      // Create a support ticket for the dispute chat
      const ticket = await tx.supportTicket.create({
        data: {
          userId,
          category: 'ORDER_ISSUE',
          priority: 'HIGH',
          description: `Dispute for Order #${orderId}\n\nReason: ${reason}`,
          assignedTo: csAgent?.id || null,
          status: csAgent ? 'IN_PROGRESS' : 'OPEN',
        },
      });
      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: userId,
          senderType: 'USER',
          content: `⚠️ Dispute opened for Order #${orderId}\n\nReason: ${reason}`,
        },
      });

      // Emit events for notifications
      this.eventEmitter.emit('order.disputed', {
        orderId,
        customerUserId: userId,
        reason,
      });

      // Notify CS agents and admins about the new dispute + support ticket
      this.eventEmitter.emit('support.new_ticket', { ticketId: ticket.id, userId });

      return d;
    });
  }

  async cancelDispute(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, dispute: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (!order.dispute) throw new BadRequestException('No dispute exists');
    if (order.dispute.status === 'RESOLVED' || order.dispute.status === 'CLOSED') {
      throw new BadRequestException('Dispute is already resolved/closed');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: order.dispute!.id },
        data: { status: 'CLOSED', resolution: 'Cancelled by customer', resolvedAt: new Date() },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED } });
      return { message: 'Dispute cancelled successfully' };
    });
  }

  async requestAssistance(orderId: string, userId: string, message?: string) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, driverAssignment: { include: { driver: true } } } });
      if (!order) throw new NotFoundException('Order not found');
      const isCust = order.customer.userId === userId;
      const isDrv = order.driverAssignment?.driver.userId === userId;
      if (!isCust && !isDrv) throw new ForbiddenException('Not authorized');

      // Check for existing open/in-progress ticket for this order
      const existingTicket = await this.prisma.supportTicket.findFirst({
        where: {
          userId,
          description: { contains: orderId },
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        include: { messages: { orderBy: { timestamp: 'asc' } } },
      });
      if (existingTicket) return existingTicket;

      const desc = `Assistance requested for Order #${orderId}`;
      const ticket = await this.prisma.$transaction(async (tx) => {
        const t = await tx.supportTicket.create({ data: { userId, category: 'ORDER_ISSUE', priority: 'MEDIUM', description: message ? `${desc}\n\n${message}` : desc } });
        await tx.supportMessage.create({ data: { ticketId: t.id, senderId: userId, senderType: 'USER', content: `🔗 Order ID: ${orderId}\n\n${message || 'I need assistance with this order.'}` } });
        return t;
      });

      // Emit event so CS agents and admins get notified
      this.eventEmitter.emit('support.new_ticket', { ticketId: ticket.id, userId });

      return ticket;
    }


  async getChatRoom(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        driverAssignment: { include: { driver: true } },
        chatRooms: {
          include: {
            driver: { select: { userId: true } },
            messages: { orderBy: { timestamp: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const room = order.chatRooms?.[0] || null;
    const isCust = order.customer.userId === userId;
    const isDrv =
      order.driverAssignment?.driver.userId === userId ||
      room?.driver?.userId === userId;
    if (!isCust && !isDrv) throw new ForbiddenException('Not authorized');
    if (!room) return null;
    return room;
  }

  async sendChatMessage(orderId: string, userId: string, content: string, image?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { include: { user: true } },
        driverAssignment: { include: { driver: { include: { user: true } } } },
        chatRooms: {
          where: { status: 'ACTIVE' as any },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const activeRoom = order.chatRooms?.[0];
    if (!activeRoom) throw new BadRequestException('No active chat room');
    const isCust = order.customer.userId === userId;
    const isDrv = order.driverAssignment?.driver.userId === userId;
    if (!isCust && !isDrv) throw new ForbiddenException('Not authorized');
    if (isDrv && activeRoom.driverId !== order.driverAssignment?.driverId) {
      throw new ForbiddenException('Not authorized');
    }
    if (activeRoom.status === 'CLOSED') throw new ForbiddenException('Chat closed');
    const message = await this.prisma.message.create({
      data: {
        chatRoomId: activeRoom.id,
        senderId: userId,
        senderType: isCust ? 'CUSTOMER' : 'DRIVER',
        content,
        image,
      },
    });

    const messagePreview = (() => {
      const text = (content || '').trim();
      if (text) return text.length > 220 ? `${text.slice(0, 217)}...` : text;
      if (image) return '📷 Photo';
      return 'Message';
    })();
    const sentAtIso = message.timestamp.toISOString();

    // Emit chat notification event
    if (isCust && order.driverAssignment?.driver) {
      this.eventEmitter.emit('chat.new_message_from_customer', {
        orderId,
        driverUserId: order.driverAssignment.driver.userId,
        customerName: `${order.customer.user.firstName || ''} ${order.customer.user.secondName || ''}`.trim(),
        messagePreview,
        messageId: message.id,
        sentAt: sentAtIso,
      });
    } else if (isDrv) {
      this.eventEmitter.emit('chat.new_message_from_driver', {
        orderId,
        customerUserId: order.customer.userId,
        driverName: `${order.driverAssignment!.driver.user.firstName || ''} ${order.driverAssignment!.driver.user.secondName || ''}`.trim(),
        messagePreview,
        messageId: message.id,
        sentAt: sentAtIso,
      });
      if (order.sourceType === OrderSourceType.DELIVERY_COMPANY && order.deliveryCompanyId) {
        const targetCompanyUserId = order.deliveryCompanyDepartmentId || order.deliveryCompanyId;
        const driverName = `${order.driverAssignment!.driver.user.firstName || ''} ${order.driverAssignment!.driver.user.secondName || ''}`.trim();
        const mirror = targetCompanyUserId !== order.deliveryCompanyId ? [order.deliveryCompanyId] : undefined;
        await this.notificationsService.send({
          userId: targetCompanyUserId,
          userType: 'USER',
          type: NotificationType.NEW_MESSAGE_FROM_DRIVER,
          relatedEntityType: 'Order',
          relatedEntityId: orderId,
          groupKey: `chat:${orderId}`,
          templateData: {
            driverName: driverName || 'Driver',
            messagePreview,
            messageId: message.id,
            sentAt: sentAtIso,
          },
          socketMirrorUserIds: mirror,
        } as any);
        const refreshTargets = [order.deliveryCompanyDepartmentId, order.deliveryCompanyId].filter(
          (id, i, arr) => id && arr.indexOf(id) === i,
        ) as string[];
        this.notificationsGateway.emitOrderChatRefresh(refreshTargets, orderId);
      }
    }

    return message;
  }

  async closeExpiredChatRooms() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expired = await this.prisma.chatRoom.findMany({
      where: { status: 'ACTIVE', order: { status: OrderStatus.DELIVERED, driverAssignment: { deliveredAt: { lte: cutoff } } } },
    });
    if (expired.length > 0) {
      await this.prisma.chatRoom.updateMany({ where: { id: { in: expired.map(c => c.id) } }, data: { status: 'CLOSED' } });
    }
    return { closed: expired.length };
  }

  /** Rate a driver after order delivery */
  async rateOrder(orderId: string, userId: string, score: number, comment?: string) {
    if (score < 0 || score > 10) throw new BadRequestException('Score must be between 0 and 10');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, driverAssignment: { include: { driver: true } }, rating: true },
    }) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.DELIVERED) throw new BadRequestException('Order must be delivered to rate');
    if (order.rating) throw new BadRequestException('You have already rated this order');
    if (!order.driverAssignment) throw new BadRequestException('No driver assigned to this order');

    const rating = await this.prisma.rating.create({
      data: {
        orderId,
        customerId: order.customerId,
        driverId: order.driverAssignment.driverId,
        score,
        comment: comment || null,
      },
    });

    // Update driver average rating
    const allRatings = await this.prisma.rating.findMany({
      where: { driverId: order.driverAssignment.driverId },
      select: { score: true },
    });
    const rawAvg =
      allRatings.length === 0
        ? 0
        : allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length;
    // Scores are 0–10; round to 2 decimals for DECIMAL(4,2)
    const avg = Math.round(Math.min(10, Math.max(0, rawAvg)) * 100) / 100;
    await this.prisma.driverPerformanceMetrics.updateMany({
      where: { driverId: order.driverAssignment.driverId },
      data: { avgRating: avg, lastCalculatedAt: new Date() },
    });

    // Notify driver about the rating
    this.eventEmitter.emit('driver.rated', {
      driverUserId: order.driverAssignment.driver.userId,
      score,
      orderId,
    });

    return rating;
  }

  /** Revert order to previous status (driver go-back) */
  async revertOrderStatus(orderId: string, driverId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, userId: true } },
        driverAssignment: {
          include: {
            driver: { include: { user: { select: { id: true, firstName: true, secondName: true } } } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.driverAssignment || order.driverAssignment.driverId !== driverId) throw new ForbiddenException('Not your order');
    const revertMap: Record<string, OrderStatus> = {
      DRIVER_ARRIVED: OrderStatus.DRIVER_ASSIGNED,
      PICKED_UP: OrderStatus.DRIVER_ARRIVED,
      DELIVERING: OrderStatus.PICKED_UP,
      RETURNED: OrderStatus.DELIVERING,
    };
    const prevStatus = revertMap[order.status];
    if (!prevStatus) throw new BadRequestException(`Cannot revert from ${order.status}`);

    // Clear the corresponding timestamp
    const clearData: any = {};
    if (order.status === 'DRIVER_ARRIVED') clearData.arrivedAt = null;
    else if (order.status === 'PICKED_UP') clearData.pickedUpAt = null;
    else if (order.status === 'DELIVERING') clearData.pickedUpAt = null; // revert to PICKED_UP clears nothing extra on assignment

    if (Object.keys(clearData).length > 0) {
      await this.prisma.driverAssignment.update({ where: { orderId }, data: clearData });
    }
    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { status: prevStatus }, include: this.orderInclude() });

    const customerUserId = order.customer?.userId;
    const driverUserId = order.driverAssignment.driver?.user?.id;
    if (customerUserId && driverUserId) {
      if (prevStatus === OrderStatus.DRIVER_ASSIGNED) {
        const u = order.driverAssignment.driver.user;
        const driverName = `${u.firstName || ''} ${u.secondName || ''}`.trim() || 'Driver';
        await this.eventEmitter.emitAsync('order.driver_assigned', {
          orderId,
          customerId: order.customer.id,
          customerUserId,
          driverId: order.driverAssignment.driverId,
          driverUserId,
          driverName,
        });
      } else if (prevStatus === OrderStatus.DRIVER_ARRIVED) {
        this.eventEmitter.emit('order.driver_arrived', { orderId, customerUserId, driverUserId });
      } else if (prevStatus === OrderStatus.PICKED_UP) {
        this.eventEmitter.emit('order.picked_up', { orderId, customerUserId, driverUserId });
      }
    }

    const viewerUserId = (updated as any).driverAssignment?.driver?.user?.id as string | undefined;
    return this.mapToResponseDto(updated as any, viewerUserId ? { viewerUserId } : undefined);
  }

  /** Get driver reviews for an order (customer can see before approving) */
  async getDriverReviewsForOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, driverAssignment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (!order.driverAssignment) throw new BadRequestException('No driver assigned');

    const driverId = order.driverAssignment.driverId;
    const ratings = await this.prisma.rating.findMany({
      where: { driverId },
      include: {
        customer: { include: { user: { select: { firstName: true, secondName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      reviews: ratings.map(r => ({
        id: r.id,
        score: r.score,
        comment: r.comment,
        createdAt: r.createdAt,
        customerName: r.customer?.user ? `${r.customer.user.firstName || ''} ${r.customer.user.secondName || ''}`.trim() || 'Customer' : 'Customer',
      })),
    };
  }

  /** Customer approves the driver — order moves from PENDING_CUSTOMER_APPROVAL to DRIVER_ASSIGNED */
  async approveDriver(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, driverAssignment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if ((order.status as string) !== 'PENDING_CUSTOMER_APPROVAL') {
      throw new BadRequestException('Order is not pending your approval');
    }
    if (!order.driverAssignment) throw new BadRequestException('No driver assigned');

    const expiryMinutes = await this.getTrackingExpiryMinutes();
    const trackingPatch: Record<string, unknown> = {};
    if (!order.trackingToken) {
      trackingPatch.trackingToken = this.generateTrackingToken();
      trackingPatch.trackingExpiresAt = new Date(Date.now() + Math.max(60, expiryMinutes) * 60 * 1000);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DRIVER_ASSIGNED,
        ...this.buildPausedTimerUpdate(order),
        ...trackingPatch,
      },
      include: this.orderInclude(),
    });

    // Emit driver_assigned event for notifications (customer approved the driver)
    const driver = order.driverAssignment;
    if (driver) {
      const driverData = await this.prisma.driver.findUnique({
        where: { id: driver.driverId },
        include: { user: { select: { id: true, firstName: true, secondName: true } } },
      });
      if (driverData) {
        await this.eventEmitter.emitAsync('order.driver_assigned', {
          orderId,
          customerId: order.customerId,
          customerUserId: userId,
          driverId: driver.driverId,
          driverUserId: driverData.user.id,
          driverName: `${driverData.user.firstName || ''} ${driverData.user.secondName || ''}`.trim(),
        });
      }
    }

    return this.mapToResponseDto(updated as any, { viewerIsCustomer: true });
  }

  /** Customer rejects the assigned driver — order goes back to SEARCHING_DRIVER */
  async rejectDriver(orderId: string, userId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { include: { user: { select: { firstName: true, secondName: true } } } },
        pickupAddress: { include: { delegation: true } },
        driverAssignment: {
          include: { driver: { include: { user: { select: { id: true, firstName: true, secondName: true } } } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    const allowedEarly =
      order.status === OrderStatus.DRIVER_ASSIGNED || (order.status as string) === 'PENDING_CUSTOMER_APPROVAL';
    const allowedArrived = order.status === OrderStatus.DRIVER_ARRIVED;
    if (!allowedEarly && !allowedArrived) {
      throw new BadRequestException('You cannot reject the driver at this stage');
    }
    if (!order.driverAssignment) throw new BadRequestException('No driver assigned');

    if (allowedArrived) {
      const r = (reason || '').trim();
      if (r.length < 10) {
        throw new BadRequestException('Please explain why you are rejecting the driver (at least 10 characters).');
      }
    }

    const driverId = order.driverAssignment.driverId;
    const rejectedDriverUserId = order.driverAssignment.driver.userId;
    const customerName =
      `${order.customer.user?.firstName || ''} ${order.customer.user?.secondName || ''}`.trim() || 'Customer';
    const driverName =
      `${order.driverAssignment.driver.user?.firstName || ''} ${order.driverAssignment.driver.user?.secondName || ''}`.trim() ||
      'Driver';

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDriverRejection.create({
        data: { orderId, driverId, reason: reason?.trim() || null },
      });
      if (allowedArrived) {
        await tx.orderDriverArrivalConflict.create({
          data: {
            orderId,
            customerId: order.customerId,
            driverId,
            customerReason: reason!.trim(),
          },
        });
      }
      await tx.driverAssignment.delete({ where: { orderId } });
      const resumedTimer = this.buildResumedTimerUpdate(order);
      const nextStatus =
        resumedTimer.cancelTimerRemainingSeconds <= 0
          ? ('AUTO_CANCELLED' as OrderStatus)
          : OrderStatus.SEARCHING_DRIVER;
      await tx.order.update({
        where: { id: orderId },
        data:
          nextStatus === ('AUTO_CANCELLED' as OrderStatus)
            ? {
                status: 'AUTO_CANCELLED' as OrderStatus,
                cancelTimerRemainingSeconds: 0,
                cancelTimerPausedAt: new Date(),
                cancelTimerLastResumedAt: null,
              }
            : {
                status: OrderStatus.SEARCHING_DRIVER,
                ...resumedTimer,
              },
      });
      if (nextStatus === ('AUTO_CANCELLED' as OrderStatus)) {
        await this.restoreCompanyOrderBudgetOnTerminalStatus(tx, order, 'AUTO_CANCELLED');
      }
      await tx.chatRoom.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'CLOSED' } });
    });

    this.eventEmitter.emit('order.driver_rejected', {
      orderId,
      customerUserId: userId,
    });
    const refreshed = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true, customer: { select: { userId: true } } } });
    if (refreshed?.status === ('AUTO_CANCELLED' as OrderStatus)) {
      this.eventEmitter.emit('order.no_driver_found', {
        orderId,
        customerUserId: refreshed.customer.userId,
      });
    }
    this.eventEmitter.emit('order.driver_rejected_notify_driver', {
      orderId,
      driverUserId: rejectedDriverUserId,
      reason: (reason || '').trim() || null,
      afterArrival: allowedArrived,
    });

    if (allowedArrived && order.pickupAddress) {
      const govId = order.pickupAddress.delegation.governorateId;
      await this.notificationsService.send({
        userId: rejectedDriverUserId,
        userType: 'USER',
        type: NotificationType.CUSTOMER_REJECTED_ARRIVED_DRIVER_TO_DRIVER,
        relatedEntityType: 'Order',
        relatedEntityId: orderId,
        templateData: { reason: reason!.trim() },
      });
      await this.notificationsService.sendToCsWithPermissionForGovernorates(
        [govId],
        CustomerServiceRole.MANAGE_DISPUTES,
        NotificationType.CUSTOMER_REJECTED_ARRIVED_DRIVER_CS,
        {
          relatedEntityType: 'Order',
          relatedEntityId: orderId,
          templateData: {
            customerName,
            driverName,
            reason: reason!.trim(),
          },
        },
      );
      await this.notificationsService.sendToAllAdmins(
        NotificationType.CUSTOMER_REJECTED_ARRIVED_DRIVER_CS,
        {
          relatedEntityType: 'Order',
          relatedEntityId: orderId,
          templateData: {
            customerName,
            driverName,
            reason: reason!.trim(),
          },
        },
      );
    }

    return { message: 'Driver rejected. Searching for a new driver.' };
  }

  async submitArrivalConflictDriverFeedback(orderId: string, driverUserId: string, feedback: string) {
    const text = feedback.trim();
    if (text.length < 5) {
      throw new BadRequestException('Please write at least 5 characters.');
    }
    const conflict = await this.prisma.orderDriverArrivalConflict.findUnique({
      where: { orderId },
      include: { driver: { include: { user: { select: { id: true } } } } },
    });
    if (!conflict) throw new NotFoundException('No incident record for this order');
    if (conflict.driver.userId !== driverUserId) throw new ForbiddenException('Not your incident');
    if (conflict.status !== 'PENDING') throw new BadRequestException('This incident is already closed');
    await this.prisma.orderDriverArrivalConflict.update({
      where: { orderId },
      data: { driverFeedback: text },
    });

    const orderForGov = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { pickupAddress: { include: { delegation: true } } },
    });
    const govId = orderForGov?.pickupAddress?.delegation?.governorateId;
    if (govId) {
      await this.notificationsService.sendToCsWithPermissionForGovernorates(
        [govId],
        CustomerServiceRole.MANAGE_DISPUTES,
        NotificationType.ARRIVAL_CONFLICT_DRIVER_FEEDBACK_CS,
        {
          relatedEntityType: 'Order',
          relatedEntityId: orderId,
          templateData: { orderIdShort: orderId.slice(0, 8) },
        },
      );
    }

    return { message: 'Feedback saved' };
  }

  /** Driver responds to a company/customer removal reason (per driver + order). */
  async respondToOrderDriverRejection(driverId: string, orderId: string, response: string) {
    const text = response.trim();
    if (text.length < 5) {
      throw new BadRequestException('Please write at least 5 characters.');
    }
    const rej = await this.prisma.orderDriverRejection.findUnique({
      where: { orderId_driverId: { orderId, driverId } },
    });
    if (!rej) throw new NotFoundException('No rejection record for you on this order');
    const updated = await this.prisma.orderDriverRejection.update({
      where: { id: rej.id },
      data: { driverResponse: text, driverRespondedAt: new Date() },
    });
    return {
      message: 'Response saved',
      rejection: {
        id: updated.id,
        reason: updated.reason,
        driverResponse: updated.driverResponse,
        driverRespondedAt: updated.driverRespondedAt,
      },
    };
  }

  /**
   * Feedback after driver marks RETURN_DEPOSIT.
   * Currently attached to customer identity; for delivery-company role this should be moved to company auth guard.
   */
  async submitReturnDepositFeedback(orderId: string, userId: string, feedback: string, conditionIssue = false) {
    const text = feedback.trim();
    if (text.length < 5) {
      throw new BadRequestException('Please write at least 5 characters.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, driverAssignment: { select: { driverId: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.RETURN_DEPOSIT) {
      throw new BadRequestException('Feedback is allowed only after return deposit.');
    }
    const drvId = order.driverAssignment?.driverId;
    if (!drvId) throw new BadRequestException('No driver assigned; feedback is stored per driver.');

    const existing = await this.prisma.orderReturnDepositFeedback.findFirst({
      where: { orderId, driverId: drvId },
    });
    const saved = existing
      ? await this.prisma.orderReturnDepositFeedback.update({
          where: { id: existing.id },
          data: { feedback: text, conditionIssue, reportedByUserId: userId },
        })
      : await this.prisma.orderReturnDepositFeedback.create({
          data: { orderId, driverId: drvId, feedback: text, conditionIssue, reportedByUserId: userId },
        });

    if (conditionIssue) {
      void this.openReturnDepositConditionDisputeIfNeeded(orderId, text).catch(() => undefined);
    }

    return { message: 'Return deposit feedback saved', feedback: saved };
  }

  /**
   * When return-deposit feedback flags a package condition issue, open a dispute for CS
   * (order stays RETURN_DEPOSIT — no status regression).
   */
  async openReturnDepositConditionDisputeIfNeeded(orderId: string, feedback: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        dispute: true,
        customer: { include: { user: { select: { id: true } } } },
        pickupAddress: { include: { delegation: { select: { governorateId: true } } } },
        deliveryCompany: { select: { id: true, name: true } },
      },
    });
    if (!order || order.dispute) return;
    if (order.status !== OrderStatus.RETURN_DEPOSIT && order.status !== OrderStatus.RETURNED) return;

    const companyBit = order.deliveryCompany?.name
      ? ` — company: ${order.deliveryCompany.name}`
      : order.deliveryCompanyId
        ? ` — company id: ${order.deliveryCompanyId}`
        : '';
    const reason = `Package condition issue (return-deposit feedback)${companyBit}:\n\n${feedback.slice(0, 4000)}`;

    const d = await this.prisma.dispute.create({
      data: {
        orderId,
        reportedBy: order.customerId,
        reason,
        assignedTo: null,
      },
    });

    const ticketUserId = order.customer.userId;
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: ticketUserId,
        category: 'ORDER_ISSUE',
        priority: 'HIGH',
        description: `Return-deposit condition dispute for order #${orderId}\n\n${reason}`,
        status: 'OPEN',
      },
    });
    await this.prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: ticketUserId,
        senderType: 'USER',
        content: `⚠️ Return-deposit package condition report for order #${orderId.slice(0, 8)}\n\n${feedback.slice(0, 2000)}`,
      },
    });

    this.eventEmitter.emit('dispute.opened', {
      disputeId: d.id,
      customerUserId: ticketUserId,
      orderId,
    });
    this.eventEmitter.emit('support.new_ticket', { ticketId: ticket.id, userId: ticketUserId });

    const govId = order.pickupAddress?.delegation?.governorateId;
    const govIds = govId ? [govId] : [];
    await this.notificationsService.sendToCsWithPermissionForGovernorates(
      govIds,
      CustomerServiceRole.MANAGE_DELIVERY_COMPANY,
      NotificationType.NEW_DISPUTE_CREATED,
      {
        title: 'Company: package condition after return deposit',
        body: `Order #${orderId.slice(0, 8)} — review Disputes and the linked support ticket.`,
        priority: NotificationPriority.HIGH,
        relatedEntityType: 'Dispute',
        relatedEntityId: d.id,
        groupKey: `dispute:${d.id}`,
      },
    );
  }

  /** Close the chat room for an order (used on CANCELLED, DELIVERED, REFUNDED) */
  private async closeChatRoomForOrder(orderId: string) {
    await this.prisma.chatRoom.updateMany({
      where: { orderId, status: 'ACTIVE' },
      data: { status: 'CLOSED' },
    });
  }

  async getAllOrders(status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: status ? { status } : undefined, include: this.orderInclude(), orderBy: { createdAt: 'desc' },
    });
    return orders.map((o: any) => this.mapToResponseDto(o, undefined));
  }

  async getOrderForAdmin(orderId: string) {
    const include: any = this.orderInclude();
    include.chatRooms = {
      orderBy: { createdAt: 'desc' },
      include: {
        driver: {
          include: {
            user: { select: { id: true, firstName: true, secondName: true, phone: true } },
          },
        },
        messages: {
          orderBy: { timestamp: 'asc' },
          include: {
            sender: { select: { id: true, firstName: true, secondName: true, phone: true } },
          },
        },
      },
    };

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include,
    }) as any;
    if (!order) throw new NotFoundException('Order not found');

    const base = this.mapToResponseDto(order, undefined);
    return {
      ...base,
      chatRoomsHistory: (order.chatRooms || []).map((room: any) => ({
        id: room.id,
        status: room.status,
        createdAt: room.createdAt,
        driver: room.driver
          ? {
              id: room.driver.id,
              userId: room.driver.userId,
              name: `${room.driver.user?.firstName || ''} ${room.driver.user?.secondName || ''}`.trim() || 'Driver',
              phone: room.driver.user?.phone || null,
            }
          : null,
        messages: (room.messages || []).map((msg: any) => ({
          id: msg.id,
          senderId: msg.senderId,
          senderType: msg.senderType,
          content: msg.content,
          image: msg.image,
          timestamp: msg.timestamp,
          sender: msg.sender
            ? {
                id: msg.sender.id,
                name: `${msg.sender.firstName || ''} ${msg.sender.secondName || ''}`.trim() || null,
                phone: msg.sender.phone || null,
              }
            : null,
        })),
      })),
    };
  }

  private capDriverDisplay(n: number): number | string {
    return n > 10 ? '10+' : n;
  }

  private async computeDriverAvailabilitySummary(delegationId: string, governorateId: string) {
    const [inDelegation, nearGov] = await Promise.all([
      this.prisma.driver.findMany({
        where: {
          status: DriverStatus.VERIFIED,
          user: { addresses: { some: { delegationId } } },
        },
        include: {
          weeklyAvailability: { include: { dayAvailabilities: { include: { timePeriods: true } } } },
        },
      }),
      this.prisma.driver.findMany({
        where: {
          status: DriverStatus.VERIFIED,
          user: {
            addresses: {
              some: {
                delegation: {
                  governorateId,
                  id: { not: delegationId },
                },
              },
            },
          },
        },
        include: {
          weeklyAvailability: { include: { dayAvailabilities: { include: { timePeriods: true } } } },
        },
      }),
    ]);

    const inC = inDelegation.filter((d) =>
      this.driverAssignmentService.isDriverCurrentlyAvailable(d.weeklyAvailability),
    ).length;
    const nearC = nearGov.filter((d) =>
      this.driverAssignmentService.isDriverCurrentlyAvailable(d.weeklyAvailability),
    ).length;

    return {
      availableInDelegation: this.capDriverDisplay(inC),
      availableNearDelegationApprox: this.capDriverDisplay(nearC),
    };
  }

  private buildUrgentNotifySummary(order: {
    createdAt: Date;
    urgentNotifyWavesSent?: number;
    urgentNotifyLastButtonAt?: Date | null;
  }) {
    const created = order.createdAt.getTime();
    const fiveMinDone = Date.now() >= created + 5 * 60_000;
    const waves = order.urgentNotifyWavesSent ?? 0;
    const lastBtn = order.urgentNotifyLastButtonAt ? order.urgentNotifyLastButtonAt.getTime() : 0;
    const cycleInProgress = false;

    let canStartNewCycle = false;
    let nextButtonEnabledAt: string | null = null;

    if (!fiveMinDone) {
      nextButtonEnabledAt = new Date(created + 5 * 60_000).toISOString();
    } else if (lastBtn) {
      const next = lastBtn + 15 * 60_000;
      if (Date.now() < next) {
        nextButtonEnabledAt = new Date(next).toISOString();
      } else {
        canStartNewCycle = true;
      }
    } else {
      canStartNewCycle = true;
    }

    return {
      canStartNewCycle,
      nextButtonEnabledAt,
      wavesSentThisCycle: waves,
      cycleInProgress,
    };
  }

  private orderInclude() {
    return {
      customer: { include: { user: { select: { id: true, firstName: true, secondName: true, phone: true } } } },
      deliveryCompany: { select: { name: true } },
      pickupAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
      dropoffAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
      driverAssignment: { include: { driver: { include: { user: { select: { id: true, firstName: true, secondName: true, phone: true, image: true } }, performanceMetrics: { select: { avgRating: true, completedOrders: true, totalOrders: true, cancelledOrders: true, completionRate: true, avgDeliveryTimeMinutes: true } } } } } },
      arrivalConflict: { include: { driver: { include: { user: { select: { id: true } } } } } },
      returnDepositFeedbacks: true,
      pricingPolicy: true,
      chatRooms: { orderBy: { createdAt: 'desc' } },
      dispute: true,
      rating: true,
    } as const;
  }

  /** Only the customer, the conflict driver, or unrestricted (admin) responses should see arrival conflict details. */
  private serializeArrivalConflictForViewer(
    order: any,
    opts?: { viewerUserId?: string; viewerIsCustomer?: boolean },
  ): OrderResponseDto['arrivalConflict'] {
    const c = order.arrivalConflict;
    if (!c) return null;
    if (opts?.viewerIsCustomer) {
      return {
        id: c.id,
        status: c.status,
        customerReason: c.customerReason,
        driverFeedback: c.driverFeedback ?? null,
        createdAt: c.createdAt,
      };
    }
    if (opts === undefined) {
      return {
        id: c.id,
        status: c.status,
        customerReason: c.customerReason,
        driverFeedback: c.driverFeedback ?? null,
        createdAt: c.createdAt,
      };
    }
    const conflictDriverUserId = c.driver?.user?.id as string | undefined;
    if (opts.viewerUserId && conflictDriverUserId && opts.viewerUserId === conflictDriverUserId) {
      return {
        id: c.id,
        status: c.status,
        customerReason: c.customerReason,
        driverFeedback: c.driverFeedback ?? null,
        createdAt: c.createdAt,
      };
    }
    return null;
  }

  mapToResponseDto(
    order: any,
    opts?: { viewerUserId?: string; viewerIsCustomer?: boolean },
  ): OrderResponseDto {
    const cancelRemainingSeconds = this.computeCancelRemainingSeconds(order);
    const latestChatRoom = (order.chatRooms || [])[0] || null;
    return {
      id: order.id, customerId: order.customerId, status: order.status, paymentType: order.paymentType,
      sourceType: order.sourceType,
      deliveryCompanyId: order.deliveryCompanyId ?? null,
      deliveryCompanyName:
        order.sourceType === OrderSourceType.DELIVERY_COMPANY && order.deliveryCompany?.name
          ? String(order.deliveryCompany.name)
          : null,
      description: order.description, weight: Number(order.weight), distanceKm: Number(order.distanceKm),
      price: Number(order.price),
      customerExtraAmount: Number(order.customerExtraAmount ?? 0),
      nightFee: Number(order.nightFee), extraWeightFee: Number(order.extraWeightFee),
      isNightDelivery: order.isNightDelivery,
      localPickupOnly: !!order.localPickupOnly,
      cancelAfterMinutes: order.cancelAfterMinutes ?? 15,
      cancelRemainingSeconds,
      cancelTimerRemainingSeconds:
        typeof order.cancelTimerRemainingSeconds === 'number' ? order.cancelTimerRemainingSeconds : null,
      cancelTimerRunning: order.status === OrderStatus.SEARCHING_DRIVER,
      cancelTimerLastResumedAt: order.cancelTimerLastResumedAt ?? null,
      scheduledPublishAt: order.scheduledPublishAt ?? null,
      deliveryZoneType: order.pricingPolicy?.deliveryZoneType || null,
      createdAt: order.createdAt,
      pickupAddress: order.pickupAddress ? {
        id: order.pickupAddress.id, street: order.pickupAddress.street,
        nickname: order.pickupAddress.nickname ?? null,
        latitude: order.pickupAddress.latitude, longitude: order.pickupAddress.longitude,
        delegation: { nameDelegation: order.pickupAddress.delegation.nameDelegation,
          governorate: { nameGovernorate: order.pickupAddress.delegation.governorate.nameGovernorate,
            country: { name: order.pickupAddress.delegation.governorate.country.name } } },
      } : null,
      dropoffAddress: order.dropoffAddress ? {
        id: order.dropoffAddress.id, street: order.dropoffAddress.street,
        nickname: order.dropoffAddress.nickname ?? null,
        latitude: order.dropoffAddress.latitude, longitude: order.dropoffAddress.longitude,
        delegation: { nameDelegation: order.dropoffAddress.delegation.nameDelegation,
          governorate: { nameGovernorate: order.dropoffAddress.delegation.governorate.nameGovernorate,
            country: { name: order.dropoffAddress.delegation.governorate.country.name } } },
      } : null,
      driverAssignment: order.driverAssignment ? {
        id: order.driverAssignment.id, driverId: order.driverAssignment.driverId,
        acceptedAt: order.driverAssignment.acceptedAt, arrivedAt: order.driverAssignment.arrivedAt,
        pickedUpAt: order.driverAssignment.pickedUpAt, deliveredAt: order.driverAssignment.deliveredAt,
        image1Proof: order.driverAssignment.image1Proof, image2Proof: order.driverAssignment.image2Proof,
        cancelledBy: order.driverAssignment.cancelledBy,
        customerCallCountBeforeReturn: order.driverAssignment.customerCallCountBeforeReturn ?? null,
        returnEvidenceImageUrl: order.driverAssignment.returnEvidenceImageUrl ?? null,
        driver: order.driverAssignment.driver ? {
          userId: order.driverAssignment.driver.userId,
          user: { firstName: order.driverAssignment.driver.user.firstName, secondName: order.driverAssignment.driver.user.secondName,
            phone: order.driverAssignment.driver.user.phone, image: order.driverAssignment.driver.user.image },
          avgRating: order.driverAssignment.driver.performanceMetrics?.avgRating ? Number(order.driverAssignment.driver.performanceMetrics.avgRating) : null,
          completedOrders: order.driverAssignment.driver.performanceMetrics?.completedOrders || 0,
          totalOrders: order.driverAssignment.driver.performanceMetrics?.totalOrders || 0,
          cancelledOrders: order.driverAssignment.driver.performanceMetrics?.cancelledOrders || 0,
          completionRate: order.driverAssignment.driver.performanceMetrics?.completionRate ? Number(order.driverAssignment.driver.performanceMetrics.completionRate) : null,
          avgDeliveryTimeMinutes: order.driverAssignment.driver.performanceMetrics?.avgDeliveryTimeMinutes || null,
        } : null,
      } : null,
      chatRoom: latestChatRoom ? { id: latestChatRoom.id, status: latestChatRoom.status } : null,
      chatRooms: (order.chatRooms || []).map((room: any) => ({
        id: room.id,
        driverId: room.driverId,
        status: room.status,
        createdAt: room.createdAt,
      })),
      dispute: order.dispute ? { id: order.dispute.id, status: order.dispute.status, reason: order.dispute.reason, resolution: order.dispute.resolution || null } : null,
      rating: order.rating ? { id: order.rating.id, score: order.rating.score, comment: order.rating.comment, createdAt: order.rating.createdAt } : null,
      arrivalConflict: this.serializeArrivalConflictForViewer(order, opts),
      returnDepositFeedback: (() => {
        const drvId = order.driverAssignment?.driverId;
        const list = order.returnDepositFeedbacks || [];
        const row = drvId ? list.find((f: any) => f.driverId === drvId) : list[0];
        return row
          ? {
              id: row.id,
              driverId: row.driverId ?? null,
              reportedByUserId: row.reportedByUserId,
              conditionIssue: row.conditionIssue,
              feedback: row.feedback,
              createdAt: row.createdAt,
            }
          : null;
      })(),
    };
  }

  private computeCancelRemainingSeconds(order: any): number {
    const fallback = Math.max(0, Number(order.cancelAfterMinutes ?? 15) * 60);
    const baseRemaining = typeof order.cancelTimerRemainingSeconds === 'number'
      ? order.cancelTimerRemainingSeconds
      : fallback;
    if (order.status === OrderStatus.PENDING_PUBLISH) {
      return Math.max(0, baseRemaining);
    }
    if (order.status !== OrderStatus.SEARCHING_DRIVER) {
      return Math.max(0, baseRemaining);
    }
    const lastResumedAt = order.cancelTimerLastResumedAt ? new Date(order.cancelTimerLastResumedAt).getTime() : null;
    if (!lastResumedAt) return Math.max(0, baseRemaining);
    const elapsedSec = Math.floor((Date.now() - lastResumedAt) / 1000);
    return Math.max(0, baseRemaining - elapsedSec);
  }

  private buildPausedTimerUpdate(order: any) {
    const remaining = this.computeCancelRemainingSeconds(order);
    return {
      cancelTimerRemainingSeconds: remaining,
      cancelTimerPausedAt: new Date(),
      cancelTimerLastResumedAt: null,
    };
  }

  private buildResumedTimerUpdate(order: any) {
    return {
      cancelTimerRemainingSeconds: this.computeCancelRemainingSeconds(order),
      cancelTimerPausedAt: null,
      cancelTimerLastResumedAt: new Date(),
    };
  }

  private async restoreCompanyOrderBudgetOnTerminalStatus(
    tx: any,
    order: any,
    status: 'CANCELLED' | 'AUTO_CANCELLED' | 'REFUNDED' | 'FAILED',
  ) {
    await rollbackDeliveryCompanyOrderFundsInTx(tx, order, status);
  }
}
