import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PriceCalculationService } from './services/price-calculation.service';
import { CreateOrderDto, PreviewOrderDto, ChangePaymentMethodDto, OrderResponseDto } from './dto/order.dto';
import { OrderStatus, PaymentType, CustomerStatus, WalletTransactionType, TransactionStatus, ReferenceType, ReferralCommissionStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceCalculationService: PriceCalculationService,
  ) {}

  // ISO code → IANA timezone mapping for night delivery auto-detection
  private static readonly COUNTRY_TIMEZONES: Record<string, string> = {
    TN: 'Africa/Tunis', DZ: 'Africa/Algiers', MA: 'Africa/Casablanca', LY: 'Africa/Tripoli',
    EG: 'Africa/Cairo', SA: 'Asia/Riyadh', AE: 'Asia/Dubai', FR: 'Europe/Paris',
    US: 'America/New_York', GB: 'Europe/London', DE: 'Europe/Berlin', TR: 'Europe/Istanbul',
  };

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

    const [pickupAddr, dropoffAddr] = await Promise.all([
      this.prisma.address.findUnique({
        where: { id: dto.pickupAddressId },
        include: { delegation: { include: { governorate: { include: { country: true } } } } },
      }),
      this.prisma.address.findUnique({
        where: { id: dto.dropoffAddressId },
        include: { delegation: { include: { governorate: { include: { country: true } } } } },
      }),
    ]);
    if (!pickupAddr || !dropoffAddr) throw new NotFoundException('Address not found');
    if (pickupAddr.userId !== userId || dropoffAddr.userId !== userId) {
      throw new ForbiddenException('You can only use your own addresses');
    }

    const country = pickupAddr.delegation.governorate.country;
    const isNight = this.isNightInCountry(country.isoCode);

    const priceCalc = await this.priceCalculationService.calculatePrice(
      dto.pickupAddressId, dto.dropoffAddressId, dto.weight, isNight,
    );
    const distance = this.priceCalculationService.calculateDistance(
      pickupAddr.latitude!, pickupAddr.longitude!, dropoffAddr.latitude!, dropoffAddr.longitude!,
    );

    const walletBalance = customer.wallet ? Number(customer.wallet.balance) : null;

    return {
      isNightDelivery: isNight,
      distanceKm: distance,
      deliveryZoneType: priceCalc.deliveryZoneType,
      baseFee: priceCalc.baseFee,
      distanceFee: priceCalc.distanceFee,
      extraWeightFee: priceCalc.extraWeightFee,
      nightFee: priceCalc.nightFee,
      totalPrice: priceCalc.totalPrice,
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
    const [pickupAddr, dropoffAddr] = await Promise.all([
      this.prisma.address.findUnique({
        where: { id: dto.pickupAddressId },
        include: { delegation: { include: { governorate: { include: { country: true } } } } },
      }),
      this.prisma.address.findUnique({
        where: { id: dto.dropoffAddressId },
      }),
    ]);
    if (!pickupAddr || !dropoffAddr) throw new NotFoundException('Address not found');
    if (pickupAddr.userId !== userId || dropoffAddr.userId !== userId) {
      throw new ForbiddenException('You can only use your own addresses');
    }
    if (dto.paymentType === PaymentType.WALLET && !customer.wallet) {
      throw new BadRequestException('You do not have a digital wallet');
    }

    // Auto-detect night delivery based on pickup country timezone
    const isNight = this.isNightInCountry(pickupAddr.delegation.governorate.country.isoCode);

    const priceCalc = await this.priceCalculationService.calculatePrice(
      dto.pickupAddressId, dto.dropoffAddressId, dto.weight, isNight,
    );
    const distance = this.priceCalculationService.calculateDistance(
      pickupAddr.latitude!, pickupAddr.longitude!, dropoffAddr.latitude!, dropoffAddr.longitude!,
    );
    if (dto.paymentType === PaymentType.WALLET && Number(customer.wallet!.balance) < priceCalc.totalPrice) {
      throw new BadRequestException('Insufficient wallet balance');
    }
    const order = await this.prisma.order.create({
      data: {
        customerId: customer.id, pricingPolicyId: priceCalc.pricingPolicyId,
        pickupAddressId: dto.pickupAddressId, dropoffAddressId: dto.dropoffAddressId,
        status: OrderStatus.SEARCHING_DRIVER, paymentType: dto.paymentType,
        description: dto.description, weight: dto.weight, distanceKm: distance,
        price: priceCalc.totalPrice, nightFee: priceCalc.nightFee,
        extraWeightFee: priceCalc.extraWeightFee, isNightDelivery: isNight,
      },
      include: this.orderInclude(),
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
    const allowed: OrderStatus[] = [OrderStatus.SEARCHING_DRIVER, OrderStatus.DRIVER_ASSIGNED, OrderStatus.DRIVER_ARRIVED];
    if (!allowed.includes(order.status)) throw new BadRequestException('Cannot change payment method after pickup');
    if (dto.paymentType === PaymentType.WALLET) {
      if (!order.customer.wallet) throw new BadRequestException('No digital wallet');
      if (Number(order.customer.wallet.balance) < Number(order.price)) throw new BadRequestException('Insufficient wallet balance');
    }
    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { paymentType: dto.paymentType }, include: this.orderInclude() });
    return this.mapToResponseDto(updated);
  }

  async getOrderById(orderId: string, userId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: this.orderInclude() }) as any;
    if (!order) throw new NotFoundException('Order not found');
    const isCustomer = order.customer?.userId === userId;
    const isDriver = order.driverAssignment?.driver?.userId === userId;
    if (!isCustomer && !isDriver) throw new ForbiddenException('No access to this order');
    return this.mapToResponseDto(order);
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
    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
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
                user: {
                  include: {
                    addresses: {
                      include: { delegation: { include: { governorate: { include: { country: true } } } } },
                      take: 1,
                    },
                  },
                },
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

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED }, include: this.orderInclude() });
      await tx.driverAssignment.update({ where: { orderId }, data: { deliveredAt: new Date() } });
      await tx.customer.update({ where: { id: order.customerId }, data: { completedOrders: { increment: 1 } } });

      if (order.paymentType === PaymentType.COD) {
        const pFee = Number(order.pricingPolicy.platformFee);
        const cash = Number(order.price);
        await tx.cashTransaction.create({ data: { orderId, driverId: order.driverAssignment.driverId, cashCollected: cash, platformFee: pFee, driverNet: cash - pFee } });
      } else if (order.customer.wallet) {
        const nb = Number(order.customer.wallet.balance) - Number(order.price);
        await tx.digitalWallet.update({ where: { id: order.customer.wallet.id }, data: { balance: nb } });
        await tx.walletTransaction.create({ data: { walletId: order.customer.wallet.id, orderId, type: WalletTransactionType.ORDER_PAYMENT, amount: -Number(order.price), status: TransactionStatus.SUCCESS, referenceId: orderId, referenceType: ReferenceType.ORDER, balanceAfter: nb } });
      }

      if (order.customer.referredByCode?.ownerId) {
        const dAddr = order.driverAssignment.driver?.user?.addresses?.[0];
        if (dAddr) {
          const cId = dAddr.delegation.governorate.country.id;
          const pr = await tx.countryPricingPolicy.findFirst({ where: { countryId: cId, isActive: true }, orderBy: { createdAt: 'desc' } });
          if (pr) {
            const ex = await tx.referralCommission.findFirst({ where: { orderId } });
            if (!ex) {
              const ca = Number(pr.baseFee);
              await tx.referralCommission.create({ data: { referralCodeId: order.customer.referredByCode.id, referrerCustomerId: order.customer.referredByCode.ownerId, referredCustomerId: order.customerId, orderId, commissionAmount: ca, status: ReferralCommissionStatus.PENDING } });
              const rw = await tx.digitalWallet.findUnique({ where: { customerId: order.customer.referredByCode.ownerId } });
              if (rw) {
                const nbl = Number(rw.balance) + ca;
                await tx.digitalWallet.update({ where: { id: rw.id }, data: { balance: nbl } });
                await tx.walletTransaction.create({ data: { walletId: rw.id, orderId, type: WalletTransactionType.REFERRAL_REWARD, amount: ca, status: TransactionStatus.SUCCESS, referenceId: orderId, referenceType: ReferenceType.REFERRAL, balanceAfter: nbl } });
              }
            }
          }
        }
      }

      await tx.driverPerformanceMetrics.updateMany({ where: { driverId: order.driverAssignment.driverId }, data: { totalOrders: { increment: 1 }, completedOrders: { increment: 1 }, lastCalculatedAt: new Date() } });
      await tx.driverAccount.updateMany({ where: { driverId: order.driverAssignment.driverId }, data: { completedDeliveries: { increment: 1 } } });
      return updatedOrder;
    });
    return this.mapToResponseDto(result as any);
  }

  async updateOrderStatus(orderId: string, driverId: string, newStatus: OrderStatus): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { driverAssignment: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.driverAssignment || order.driverAssignment.driverId !== driverId) throw new ForbiddenException('Not your order');
    const valid: Record<string, OrderStatus[]> = {
      DRIVER_ASSIGNED: [OrderStatus.DRIVER_ARRIVED], DRIVER_ARRIVED: [OrderStatus.PICKED_UP],
      PICKED_UP: [OrderStatus.DELIVERING], DELIVERING: [OrderStatus.DELIVERED],
    };
    if (!(valid[order.status] || []).includes(newStatus)) throw new BadRequestException(`Cannot transition from ${order.status} to ${newStatus}`);
    if (newStatus === OrderStatus.DELIVERED) return this.completeOrder(orderId, driverId);
    if (newStatus === OrderStatus.DRIVER_ARRIVED) await this.prisma.driverAssignment.update({ where: { orderId }, data: { arrivedAt: new Date() } });
    else if (newStatus === OrderStatus.PICKED_UP) await this.prisma.driverAssignment.update({ where: { orderId }, data: { pickedUpAt: new Date() } });
    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { status: newStatus }, include: this.orderInclude() });
    return this.mapToResponseDto(updated as any);
  }

  async uploadProofs(orderId: string, driverId: string, image1Proof?: string, image2Proof?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { driverAssignment: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.driverAssignment || order.driverAssignment.driverId !== driverId) throw new ForbiddenException('Not your order');
    return this.prisma.driverAssignment.update({ where: { orderId }, data: { ...(image1Proof && { image1Proof }), ...(image2Proof && { image2Proof }) } });
  }

  async getDriverLocation(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    const active: OrderStatus[] = [OrderStatus.DRIVER_ASSIGNED, OrderStatus.DRIVER_ARRIVED, OrderStatus.PICKED_UP, OrderStatus.DELIVERING];
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

  async createDispute(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, dispute: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.dispute) throw new BadRequestException('Dispute already exists');
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({ data: { orderId, reportedBy: order.customerId, reason } });
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.DISPUTED } });
      return d;
    });
  }

  async requestAssistance(orderId: string, userId: string, message?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, driverAssignment: { include: { driver: true } } } });
    if (!order) throw new NotFoundException('Order not found');
    const isCust = order.customer.userId === userId;
    const isDrv = order.driverAssignment?.driver.userId === userId;
    if (!isCust && !isDrv) throw new ForbiddenException('Not authorized');
    const desc = `Assistance requested for Order #${orderId}`;
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.supportTicket.create({ data: { userId, category: 'ORDER_ISSUE', priority: 'MEDIUM', description: message ? `${desc}\n\n${message}` : desc } });
      await tx.supportMessage.create({ data: { ticketId: t.id, senderId: userId, senderType: 'USER', content: `🔗 Order ID: ${orderId}\n\n${message || 'I need assistance with this order.'}` } });
      return t;
    });
  }

  async getChatRoom(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, driverAssignment: { include: { driver: true } }, chatRoom: { include: { messages: { orderBy: { timestamp: 'asc' } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const isCust = order.customer.userId === userId;
    const isDrv = order.driverAssignment?.driver.userId === userId;
    if (!isCust && !isDrv) throw new ForbiddenException('Not authorized');
    return order.chatRoom;
  }

  async sendChatMessage(orderId: string, userId: string, content: string, image?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, driverAssignment: { include: { driver: true } }, chatRoom: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.chatRoom) throw new BadRequestException('No chat room');
    const isCust = order.customer.userId === userId;
    const isDrv = order.driverAssignment?.driver.userId === userId;
    if (!isCust && !isDrv) throw new ForbiddenException('Not authorized');
    if (order.chatRoom.status === 'CLOSED') throw new ForbiddenException('Chat closed');
    return this.prisma.message.create({ data: { chatRoomId: order.chatRoom.id, senderId: userId, senderType: isCust ? 'CUSTOMER' : 'DRIVER', content, image } });
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

  async getAllOrders(status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: status ? { status } : undefined, include: this.orderInclude(), orderBy: { createdAt: 'desc' },
    });
    return orders.map((o: any) => this.mapToResponseDto(o));
  }

  private orderInclude() {
    return {
      customer: { include: { user: { select: { id: true, firstName: true, secondName: true, phone: true } } } },
      pickupAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
      dropoffAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
      driverAssignment: { include: { driver: { include: { user: { select: { id: true, firstName: true, secondName: true, phone: true, image: true } } } } } },
      pricingPolicy: true, chatRoom: true, dispute: true,
    } as const;
  }

  mapToResponseDto(order: any): OrderResponseDto {
    return {
      id: order.id, customerId: order.customerId, status: order.status, paymentType: order.paymentType,
      description: order.description, weight: Number(order.weight), distanceKm: Number(order.distanceKm),
      price: Number(order.price), nightFee: Number(order.nightFee), extraWeightFee: Number(order.extraWeightFee),
      isNightDelivery: order.isNightDelivery, deliveryZoneType: order.pricingPolicy?.deliveryZoneType || null,
      createdAt: order.createdAt,
      pickupAddress: order.pickupAddress ? {
        id: order.pickupAddress.id, street: order.pickupAddress.street,
        latitude: order.pickupAddress.latitude, longitude: order.pickupAddress.longitude,
        delegation: { nameDelegation: order.pickupAddress.delegation.nameDelegation,
          governorate: { nameGovernorate: order.pickupAddress.delegation.governorate.nameGovernorate,
            country: { name: order.pickupAddress.delegation.governorate.country.name } } },
      } : null,
      dropoffAddress: order.dropoffAddress ? {
        id: order.dropoffAddress.id, street: order.dropoffAddress.street,
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
        } : null,
      } : null,
      chatRoom: order.chatRoom ? { id: order.chatRoom.id, status: order.chatRoom.status } : null,
      dispute: order.dispute ? { id: order.dispute.id, status: order.dispute.status, reason: order.dispute.reason } : null,
    };
  }
}
