import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PriceCalculationService } from './services/price-calculation.service';
import { DriverAssignmentService } from './services/driver-assignment.service';
import { CreateOrderDto, PreviewOrderDto, ChangePaymentMethodDto, OrderResponseDto } from './dto/order.dto';
import { OrderStatus, PaymentType, CustomerStatus, WalletTransactionType, TransactionStatus, ReferenceType, ReferralCommissionStatus, DriverStatus, NotificationType, CustomerServiceRole, OrderSourceType, DeliveryCompanyTransactionType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceCalculationService: PriceCalculationService,
    private readonly driverAssignmentService: DriverAssignmentService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly eventEmitter: EventEmitter2,
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
      include: { wallet: true },
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

    const walletBalance = customer.wallet ? Number(customer.wallet.balance) : null;

    const extra = this.normalizeCustomerExtraAmount(dto.customerExtraAmount);
    const calculatedPrice = priceCalc.totalPrice;
    const totalPrice = Math.round((calculatedPrice + extra) * 100) / 100;

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
      currency: country.currencyCode,
      currencySymbol: country.currencySymbol,
      walletBalance,
      paymentType: dto.paymentType,
    };
  }

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      include: { wallet: true },
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

    let dropoffAddr: { id: string; latitude: number | null; longitude: number | null } | null = null;
    if (!localPickup) {
      dropoffAddr = await this.prisma.address.findUnique({
        where: { id: dto.dropoffAddressId! },
      });
      if (!dropoffAddr) throw new NotFoundException('Address not found');
    }

    if (dto.paymentType === PaymentType.WALLET && !customer.wallet) {
      throw new BadRequestException('You do not have a digital wallet');
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

    if (dto.paymentType === PaymentType.WALLET && Number(customer.wallet!.balance) < finalPrice) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const order = await this.prisma.order.create({
      data: {
        customerId: customer.id,
        pricingPolicyId: priceCalc.pricingPolicyId,
        pickupAddressId: dto.pickupAddressId,
        dropoffAddressId: localPickup ? null : dto.dropoffAddressId,
        localPickupOnly: localPickup,
        status: OrderStatus.SEARCHING_DRIVER,
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
        ...(dto.cancelAfterMinutes !== undefined && { cancelAfterMinutes: dto.cancelAfterMinutes }),
        cancelTimerRemainingSeconds: (dto.cancelAfterMinutes ?? 15) * 60,
        cancelTimerLastResumedAt: new Date(),
        cancelTimerPausedAt: null,
      },
      include: this.orderInclude(),
    });
    this.eventEmitter.emit('order.created', {
      orderId: order.id,
      customerId: customer.id,
      userId,
      pickupGovernorateId: pickupAddr.delegation.governorateId,
    });
    return this.mapToResponseDto(order);
  }

  async changePaymentMethod(orderId: string, userId: string, dto: ChangePaymentMethodDto): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { include: { wallet: true } } },
    }) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    const allowed: OrderStatus[] = [OrderStatus.SEARCHING_DRIVER, 'PENDING_CUSTOMER_APPROVAL' as any, OrderStatus.DRIVER_ASSIGNED, OrderStatus.DRIVER_ARRIVED];
    if (!allowed.includes(order.status)) throw new BadRequestException('Cannot change payment method after pickup');
    if (dto.paymentType === PaymentType.WALLET) {
      if (!order.customer.wallet) throw new BadRequestException('No digital wallet');
      if (Number(order.customer.wallet.balance) < Number(order.price)) throw new BadRequestException('Insufficient wallet balance');
    }
    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { paymentType: dto.paymentType }, include: this.orderInclude() });
    return this.mapToResponseDto(updated);
  }

  async updateCancelAfterMinutes(orderId: string, userId: string, cancelAfterMinutes: number): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    }) as any;
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (![OrderStatus.SEARCHING_DRIVER, 'PENDING_CUSTOMER_APPROVAL' as any, OrderStatus.DRIVER_ASSIGNED].includes(order.status)) {
      throw new BadRequestException('Cancel timer can only be changed before pickup');
    }
    if (order.localPickupOnly) {
      if (cancelAfterMinutes < 5 || cancelAfterMinutes > 240) {
        throw new BadRequestException('Local pickup auto-cancel time must be between 5 and 240 minutes');
      }
    } else if (cancelAfterMinutes < 15 || cancelAfterMinutes > 1440) {
      throw new BadRequestException('Auto-cancel time must be between 15 and 1440 minutes');
    }
    const currentRemaining = this.computeCancelRemainingSeconds(order);
    const currentCancelMinutes = order.cancelAfterMinutes ?? 15;
    const nextRemaining = Math.max(0, currentRemaining + ((cancelAfterMinutes - currentCancelMinutes) * 60));
    const now = new Date();
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        cancelAfterMinutes,
        cancelTimerRemainingSeconds: nextRemaining,
        cancelTimerLastResumedAt: order.status === OrderStatus.SEARCHING_DRIVER ? now : null,
        cancelTimerPausedAt: order.status === OrderStatus.SEARCHING_DRIVER ? null : (order.cancelTimerPausedAt ?? now),
      },
      include: this.orderInclude(),
    });
    return this.mapToResponseDto(updated);
  }

  async getOrderById(orderId: string, userId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: this.orderInclude() }) as any;
    if (!order) throw new NotFoundException('Order not found');
    const isCustomer = order.customer?.userId === userId;
    const isDriver = order.driverAssignment?.driver?.userId === userId;
    const isConflictDriver = order.arrivalConflict?.driver?.userId === userId;
    if (!isCustomer && !isDriver && !isConflictDriver) throw new ForbiddenException('No access to this order');
    const dto = this.mapToResponseDto(order);
    if (isCustomer && order.pickupAddress && order.status === OrderStatus.SEARCHING_DRIVER) {
      dto.driverAvailability = await this.computeDriverAvailabilitySummary(
        order.pickupAddress.delegationId,
        order.pickupAddress.delegation.governorateId,
      );
      dto.urgentNotify = this.buildUrgentNotifySummary(order);
    }
    return dto;
  }

  async getCustomerOrders(userId: string): Promise<OrderResponseDto[]> {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Customer profile not found');
    const orders = await this.prisma.order.findMany({ where: { customerId: customer.id }, include: this.orderInclude(), orderBy: { createdAt: 'desc' } });
    return orders.map((o: any) => this.mapToResponseDto(o));
  }

  async getDriverOrders(driverId: string): Promise<OrderResponseDto[]> {
    const orders = await this.prisma.order.findMany({ where: { driverAssignment: { driverId } }, include: this.orderInclude(), orderBy: { createdAt: 'desc' } });
    return orders.map((o: any) => this.mapToResponseDto(o));
  }

  async cancelOrder(orderId: string, userId: string, reason: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.SEARCHING_DRIVER && order.status !== OrderStatus.DRAFT) {
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

  async completeOrder(orderId: string, driverId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { include: { wallet: true, referredByCode: true, user: true } },
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

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED, trackingExpiresAt }, include: this.orderInclude() });      await tx.driverAssignment.update({ where: { orderId }, data: { deliveredAt: new Date() } });
      await tx.customer.update({ where: { id: order.customerId }, data: { completedOrders: { increment: 1 } } });

      if (order.paymentType === PaymentType.COD) {
        const pFee = Number(order.pricingPolicy.platformFee);
        const cash = Number(order.price);
        await tx.cashTransaction.create({ data: { orderId, driverId: order.driverAssignment.driverId, cashCollected: cash, platformFee: pFee, driverNet: cash - pFee } });

        // Calculate referral commission if applicable
        let referralAmount = 0;
        if (order.customer.referredByCode?.ownerId) {
          const ex = await tx.referralCommission.findFirst({ where: { orderId } });
          if (!ex && order.pricingPolicy) {
            referralAmount = Number(order.pricingPolicy.baseFee);
          }
        }

        // Debit driver account: platformFee + referralCommission
        const totalDebit = pFee + referralAmount;
        const driverAccount = await tx.driverAccount.findUnique({ where: { driverId: order.driverAssignment.driverId } });
        if (driverAccount) {
          const oldBalance = Number(driverAccount.balance);
          const newBalance = oldBalance - totalDebit;
          const updateData: any = { balance: newBalance };
          // Track when balance first goes negative
          if (newBalance < 0 && oldBalance >= 0) {
            updateData.negativeBalanceSince = new Date();
          }
          await tx.driverAccount.update({ where: { id: driverAccount.id }, data: updateData });
          await tx.driverTransaction.create({
            data: {
              accountId: driverAccount.id,
              type: 'PLATFORM_FEE',
              amount: -totalDebit,
              referenceId: orderId,
              referenceType: 'ORDER',
              description: `COD order #${orderId.slice(0, 8)} — platform fee${referralAmount > 0 ? ' + referral commission' : ''}`,
              balanceAfter: newBalance,
            },
          });
        }
      } else if (order.customer.wallet && order.sourceType !== OrderSourceType.DELIVERY_COMPANY) {
        const nb = Number(order.customer.wallet.balance) - Number(order.price);
        await tx.digitalWallet.update({ where: { id: order.customer.wallet.id }, data: { balance: nb } });
        await tx.walletTransaction.create({ data: { walletId: order.customer.wallet.id, orderId, type: WalletTransactionType.ORDER_PAYMENT, amount: -Number(order.price), status: TransactionStatus.SUCCESS, referenceId: orderId, referenceType: ReferenceType.ORDER, balanceAfter: nb } });
      }

      if (order.customer.referredByCode?.ownerId) {
        const ex = await tx.referralCommission.findFirst({ where: { orderId } });
        if (!ex && order.pricingPolicy) {
          const baseCommission = Number(order.pricingPolicy.baseFee);
          const multiplier = order.sourceType === OrderSourceType.DELIVERY_COMPANY ? 0.5 : 1;
          const ca = Math.round(baseCommission * multiplier * 100) / 100;
          await tx.referralCommission.create({ data: { referralCodeId: order.customer.referredByCode.id, referrerCustomerId: order.customer.referredByCode.ownerId, referredCustomerId: order.customerId, orderId, commissionAmount: ca, status: ReferralCommissionStatus.PAID } });
          const rw = await tx.digitalWallet.findUnique({ where: { customerId: order.customer.referredByCode.ownerId } });
          if (rw) {
            const nbl = Number(rw.balance) + ca;
            await tx.digitalWallet.update({ where: { id: rw.id }, data: { balance: nbl } });
            await tx.walletTransaction.create({ data: { walletId: rw.id, orderId, type: WalletTransactionType.REFERRAL_REWARD, amount: ca, status: TransactionStatus.SUCCESS, referenceId: orderId, referenceType: ReferenceType.REFERRAL, balanceAfter: nbl } });
          }
        }
      }

      await tx.driverPerformanceMetrics.updateMany({ where: { driverId: order.driverAssignment.driverId }, data: { totalOrders: { increment: 1 }, completedOrders: { increment: 1 }, lastCalculatedAt: new Date() } });
      await tx.driverAccount.updateMany({ where: { driverId: order.driverAssignment.driverId }, data: { completedDeliveries: { increment: 1 } } });

      if (order.deliveryCompanyId) {
        const company = await tx.deliveryCompany.findUnique({ where: { id: order.deliveryCompanyId } });
        if (company) {
          const reserve = Math.round(Number(order.price) * 0.5 * 100) / 100;
          const nextLocked = Math.max(0, Number(company.lockedCoins) - reserve);
          await tx.deliveryCompany.update({
            where: { id: company.id },
            data: { lockedCoins: nextLocked },
          });
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
    return this.mapToResponseDto(result as any);
  }

  async updateOrderStatus(orderId: string, driverId: string, newStatus: OrderStatus): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { driverAssignment: { include: { driver: { select: { userId: true } } } } },
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
    if (newStatus === OrderStatus.RETURNED) {
      if (!order.driverAssignment.image1Proof) {
        throw new BadRequestException('You must upload at least the first proof image before marking the order as returned');
      }
      if (order.deliveryCompanyId) {
        await this.prisma.$transaction(async (tx) => {
          const company = await tx.deliveryCompany.findUnique({ where: { id: order.deliveryCompanyId! } });
          if (!company) return;
          const surcharge = Math.round(Number(order.price) * 0.5 * 100) / 100;
          const consumeFromLocked = Math.min(Number(company.lockedCoins), surcharge);
          const remainingCharge = surcharge - consumeFromLocked;
          const nextLocked = Number(company.lockedCoins) - consumeFromLocked;
          const nextBalance = Number(company.coinBalance) - remainingCharge;
          await tx.deliveryCompany.update({
            where: { id: company.id },
            data: { coinBalance: nextBalance, lockedCoins: nextLocked },
          });
          await tx.deliveryCompanyTransaction.create({
            data: {
              deliveryCompanyId: company.id,
              orderId: order.id,
              type: DeliveryCompanyTransactionType.RETURN_SURCHARGE,
              amount: -surcharge,
              balanceAfter: nextBalance,
              description: `Return surcharge (50%) for order ${order.id}`,
            },
          });
        });
      }
    }
    if (newStatus === OrderStatus.DRIVER_ARRIVED) await this.prisma.driverAssignment.update({ where: { orderId }, data: { arrivedAt: new Date() } });
    else if (newStatus === OrderStatus.PICKED_UP) await this.prisma.driverAssignment.update({ where: { orderId }, data: { pickedUpAt: new Date() } });
    else if (newStatus === OrderStatus.RETURN_DEPOSIT && order.deliveryCompanyId) {
      await this.prisma.$transaction(async (tx) => {
        const company = await tx.deliveryCompany.findUnique({ where: { id: order.deliveryCompanyId! } });
        if (!company) return;
        const reserve = Math.round(Number(order.price) * 0.5 * 100) / 100;
        const nextLocked = Math.max(0, Number(company.lockedCoins) - reserve);
        await tx.deliveryCompany.update({
          where: { id: company.id },
          data: { lockedCoins: nextLocked },
        });
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

    return this.mapToResponseDto(updated as any);
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
        dropoffAddress: { include: { delegation: { include: { governorate: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Invalid tracking token');

    const trackable: OrderStatus[] = [OrderStatus.PICKED_UP, OrderStatus.DELIVERING];
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
      dropoffAddress: order.dropoffAddress ? {
        street: order.dropoffAddress.street,
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

    // Emit chat notification event
    if (isCust && order.driverAssignment?.driver) {
      this.eventEmitter.emit('chat.new_message_from_customer', {
        orderId,
        driverUserId: order.driverAssignment.driver.userId,
        customerName: `${order.customer.user.firstName || ''} ${order.customer.user.secondName || ''}`.trim(),
      });
    } else if (isDrv) {
      this.eventEmitter.emit('chat.new_message_from_driver', {
        orderId,
        customerUserId: order.customer.userId,
        driverName: `${order.driverAssignment!.driver.user.firstName || ''} ${order.driverAssignment!.driver.user.secondName || ''}`.trim(),
      });
      if (order.sourceType === OrderSourceType.DELIVERY_COMPANY && order.deliveryCompanyId) {
        const targetCompanyUserId = order.deliveryCompanyDepartmentId || order.deliveryCompanyId;
        const refreshTargets = [targetCompanyUserId, order.deliveryCompanyId].filter(
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
        this.eventEmitter.emit('order.driver_assigned', {
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

    return this.mapToResponseDto(updated as any);
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

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DRIVER_ASSIGNED,
        ...this.buildPausedTimerUpdate(order),
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
        this.eventEmitter.emit('order.driver_assigned', {
          orderId,
          customerId: order.customerId,
          customerUserId: userId,
          driverId: driver.driverId,
          driverUserId: driverData.user.id,
          driverName: `${driverData.user.firstName || ''} ${driverData.user.secondName || ''}`.trim(),
        });
      }
    }

    return this.mapToResponseDto(updated as any);
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
          ? OrderStatus.CANCELLED
          : OrderStatus.SEARCHING_DRIVER;
      await tx.order.update({
        where: { id: orderId },
        data:
          nextStatus === OrderStatus.CANCELLED
            ? {
                status: OrderStatus.CANCELLED,
                cancelTimerRemainingSeconds: 0,
                cancelTimerPausedAt: new Date(),
                cancelTimerLastResumedAt: null,
              }
            : {
                status: OrderStatus.SEARCHING_DRIVER,
                ...resumedTimer,
              },
      });
      if (nextStatus === OrderStatus.CANCELLED) {
        await this.restoreCompanyOrderBudgetOnTerminalStatus(tx, order, 'CANCELLED');
      }
      await tx.chatRoom.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'CLOSED' } });
    });

    this.eventEmitter.emit('order.driver_rejected', {
      orderId,
      customerUserId: userId,
    });
    const refreshed = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true, customer: { select: { userId: true } } } });
    if (refreshed?.status === OrderStatus.CANCELLED) {
      this.eventEmitter.emit('order.no_driver_found', {
        orderId,
        customerUserId: refreshed.customer.userId,
      });
    }
    this.eventEmitter.emit('order.driver_rejected_notify_driver', {
      orderId,
      driverUserId: rejectedDriverUserId,
      reason: (reason || '').trim() || null,
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
      include: { customer: true, returnDepositFeedback: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.RETURN_DEPOSIT) {
      throw new BadRequestException('Feedback is allowed only after return deposit.');
    }

    const saved = order.returnDepositFeedback
      ? await this.prisma.orderReturnDepositFeedback.update({
          where: { orderId },
          data: { feedback: text, conditionIssue, reportedByUserId: userId },
        })
      : await this.prisma.orderReturnDepositFeedback.create({
          data: { orderId, feedback: text, conditionIssue, reportedByUserId: userId },
        });

    return { message: 'Return deposit feedback saved', feedback: saved };
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
    return orders.map((o: any) => this.mapToResponseDto(o));
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

    const base = this.mapToResponseDto(order);
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
      returnDepositFeedback: true,
      pricingPolicy: true,
      chatRooms: { orderBy: { createdAt: 'desc' } },
      dispute: true,
      rating: true,
    } as const;
  }

  mapToResponseDto(order: any): OrderResponseDto {
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
      cancelTimerRunning: order.status === OrderStatus.SEARCHING_DRIVER,
      cancelTimerLastResumedAt: order.cancelTimerLastResumedAt ?? null,
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
      arrivalConflict: order.arrivalConflict
        ? {
            id: order.arrivalConflict.id,
            status: order.arrivalConflict.status,
            customerReason: order.arrivalConflict.customerReason,
            driverFeedback: order.arrivalConflict.driverFeedback ?? null,
            createdAt: order.arrivalConflict.createdAt,
          }
        : null,
      returnDepositFeedback: order.returnDepositFeedback
        ? {
            id: order.returnDepositFeedback.id,
            reportedByUserId: order.returnDepositFeedback.reportedByUserId,
            conditionIssue: order.returnDepositFeedback.conditionIssue,
            feedback: order.returnDepositFeedback.feedback,
            createdAt: order.returnDepositFeedback.createdAt,
          }
        : null,
    };
  }

  private computeCancelRemainingSeconds(order: any): number {
    const fallback = Math.max(0, Number(order.cancelAfterMinutes ?? 15) * 60);
    const baseRemaining = typeof order.cancelTimerRemainingSeconds === 'number'
      ? order.cancelTimerRemainingSeconds
      : fallback;
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
    status: 'CANCELLED' | 'REFUNDED' | 'FAILED',
  ) {
    if (!order?.deliveryCompanyId || order?.sourceType !== OrderSourceType.DELIVERY_COMPANY) return;
    const company = await tx.deliveryCompany.findUnique({ where: { id: order.deliveryCompanyId } });
    if (!company) return;
    const price = Math.round(Number(order.price || 0) * 100) / 100;
    const reserve = Math.round(price * 0.5 * 100) / 100;
    const unlock = Math.min(Number(company.lockedCoins), reserve);
    const nextLocked = Math.max(0, Number(company.lockedCoins) - unlock);
    const restoreAmount = Math.round((price + unlock) * 100) / 100;
    const nextBalance = Math.round((Number(company.coinBalance) + restoreAmount) * 100) / 100;
    await tx.deliveryCompany.update({
      where: { id: company.id },
      data: { coinBalance: nextBalance, lockedCoins: nextLocked },
    });
    await tx.deliveryCompanyTransaction.create({
      data: {
        deliveryCompanyId: company.id,
        orderId: order.id,
        type: DeliveryCompanyTransactionType.ADMIN_ADJUSTMENT,
        amount: restoreAmount,
        balanceAfter: nextBalance,
        description: `Budget rollback for ${status} order ${order.id}`,
      },
    });
    if (order.deliveryCompanyDepartmentId) {
      const txAny: any = tx as any;
      if (txAny.deliveryCompanyDepartmentBudgetWallet) {
        const wallet = await txAny.deliveryCompanyDepartmentBudgetWallet.findUnique({
          where: { departmentId: order.deliveryCompanyDepartmentId },
        });
        if (wallet) {
          await txAny.deliveryCompanyDepartmentBudgetWallet.update({
            where: { departmentId: order.deliveryCompanyDepartmentId },
            data: { availableCoins: Math.round((Number(wallet.availableCoins) + restoreAmount) * 100) / 100 },
          });
        }
      }
    }
  }
}
