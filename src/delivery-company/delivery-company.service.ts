import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DeliveryCompanyRefundDestinationType, DeliveryCompanyRefundStatus, DeliveryCompanyTransactionType, OrderSourceType, OrderStatus, PaymentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PriceCalculationService } from '../orders/services/price-calculation.service';
import {
  CompanyOrderPreviewResponseDto,
  CreateDeliveryCompanyAddressDto,
  CreateDeliveryCompanyApiKeyDto,
  CreateDeliveryCompanyDto,
  CreateDeliveryCompanyOrderDto,
  CreateDeliveryCompanyRefundRequestDto,
  UpdateDeliveryCompanyDto,
} from './dto/delivery-company.dto';

@Injectable()
export class DeliveryCompanyService {
  private static readonly MAX_CUSTOMER_EXTRA = 10000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceCalculationService: PriceCalculationService,
  ) {}

  async createCompany(dto: CreateDeliveryCompanyDto) {
    const created = await this.prisma.deliveryCompany.create({
      data: {
        name: dto.name,
        contactEmail: (dto as any).contactEmail ?? null,
        passwordHash: (dto as any).passwordHash ?? null,
        legalName: dto.legalName,
        taxId: dto.taxId,
        proxyCustomerId: dto.proxyCustomerId,
        maxNegativeBalance: dto.maxNegativeBalance ?? 0,
        defaultDiscountPercent: dto.defaultDiscountPercent ?? null,
      } as any,
    });
    await this.logAudit(created.id, 'COMPANY_CREATED', 'ADMIN');
    return created;
  }

  async updateCompany(id: string, dto: UpdateDeliveryCompanyDto) {
    const company = await this.prisma.deliveryCompany.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Delivery company not found');
    const updated = await this.prisma.deliveryCompany.update({ where: { id }, data: dto as any });
    await this.logAudit(id, 'COMPANY_UPDATED', 'ADMIN', null, dto as any);
    return updated;
  }

  async listCompanies() {
    return this.prisma.deliveryCompany.findMany({
      include: {
        addresses: true,
        bankAccounts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApiKey(companyId: string, dto: CreateDeliveryCompanyApiKeyDto) {
    const company = await this.prisma.deliveryCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Delivery company not found');

    const raw = `dck_${randomBytes(20).toString('hex')}`;
    const keyPrefix = raw.slice(0, 12);
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const created = await this.prisma.deliveryCompanyApiKey.create({
      data: {
        deliveryCompanyId: companyId,
        name: dto.name,
        keyPrefix,
        keyHash,
        scopes: dto.scopes ?? ['orders:read', 'orders:write', 'wallet:read', 'refunds:write'],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    await this.logAudit(companyId, 'API_KEY_CREATED', 'ADMIN', null, { apiKeyId: created.id, scopes: created.scopes });
    return { ...created, rawKey: raw };
  }

  async revokeApiKey(companyId: string, keyId: string) {
    const apiKey = await this.prisma.deliveryCompanyApiKey.findFirst({
      where: { id: keyId, deliveryCompanyId: companyId },
    });
    if (!apiKey) throw new NotFoundException('API key not found');
    const revoked = await this.prisma.deliveryCompanyApiKey.update({
      where: { id: keyId },
      data: { status: 'REVOKED' },
    });
    await this.logAudit(companyId, 'API_KEY_REVOKED', 'ADMIN', null, { apiKeyId: keyId });
    return revoked;
  }

  async getCompanyProfile(companyId: string) {
    const company = await this.prisma.deliveryCompany.findUnique({
      where: { id: companyId },
      include: {
        addresses: { orderBy: { createdAt: 'desc' } },
        bankAccounts: { orderBy: { createdAt: 'desc' } },
        apiKeys: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!company) throw new NotFoundException('Delivery company not found');
    return company;
  }

  async createCompanyAddress(companyId: string, dto: CreateDeliveryCompanyAddressDto) {
    if (dto.isDefault) {
      await this.prisma.deliveryCompanyAddress.updateMany({
        where: { deliveryCompanyId: companyId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const created = await this.prisma.deliveryCompanyAddress.create({
      data: { deliveryCompanyId: companyId, ...dto },
    });
    await this.logAudit(companyId, 'DEPARTMENT_CREATED', 'COMPANY');
    return created;
  }

  async listCompanyOrders(companyId: string) {
    return this.prisma.order.findMany({
      where: { deliveryCompanyId: companyId, sourceType: OrderSourceType.DELIVERY_COMPANY },
      include: {
        pickupAddress: { include: { delegation: { include: { governorate: true } } } },
        dropoffAddress: { include: { delegation: { include: { governorate: true } } } },
        driverAssignment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async submitReturnDepositFeedback(
    companyId: string,
    orderId: string,
    feedback: string,
    conditionIssue = false,
  ) {
    const text = feedback.trim();
    if (text.length < 5) {
      throw new BadRequestException('Please write at least 5 characters.');
    }
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        deliveryCompanyId: companyId,
        sourceType: OrderSourceType.DELIVERY_COMPANY,
      },
      include: { returnDepositFeedback: true },
    });
    if (!order) throw new NotFoundException('Order not found for this company');
    if (order.status !== OrderStatus.RETURN_DEPOSIT) {
      throw new BadRequestException('Feedback is allowed only after return deposit.');
    }
    const saved = order.returnDepositFeedback
      ? await this.prisma.orderReturnDepositFeedback.update({
          where: { orderId },
          data: {
            feedback: text,
            conditionIssue,
            reportedByUserId: order.customerId,
          },
        })
      : await this.prisma.orderReturnDepositFeedback.create({
          data: {
            orderId,
            feedback: text,
            conditionIssue,
            reportedByUserId: order.customerId,
          },
        });
    return { message: 'Return deposit feedback saved', feedback: saved };
  }

  async getWallet(companyId: string) {
    const company = await this.prisma.deliveryCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Delivery company not found');
    return {
      balance: Number(company.coinBalance),
      locked: Number(company.lockedCoins),
      maxNegativeBalance: Number(company.maxNegativeBalance),
      availableCapacity:
        Number(company.coinBalance) + Number(company.maxNegativeBalance) - Number(company.lockedCoins),
    };
  }

  async getWalletTransactions(companyId: string) {
    return this.prisma.deliveryCompanyTransaction.findMany({
      where: { deliveryCompanyId: companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async previewOrder(companyId: string, dto: CreateDeliveryCompanyOrderDto): Promise<CompanyOrderPreviewResponseDto> {
    const company = await this.prisma.deliveryCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Delivery company not found');

    const localPickup = !!dto.localPickupOnly;
    const extra = this.normalizeExtra(dto.customerExtraAmount);
    const isNight = false;

    const priceCalc = localPickup
      ? await this.priceCalculationService.calculateLocalPickupOnlyPrice(dto.pickupAddressId, dto.weight, isNight)
      : await this.priceCalculationService.calculatePrice(dto.pickupAddressId, dto.dropoffAddressId!, dto.weight, isNight);

    const discount = await this.getEffectiveDiscountPercent(company);
    const discounted = Math.round(priceCalc.totalPrice * (1 + discount / 100) * 100) / 100;
    const total = Math.round((discounted + extra) * 100) / 100;
    const reserve = Math.round(total * 0.5 * 100) / 100;
    const required = total + reserve;
    return {
      paymentType: PaymentType.WALLET,
      effectiveDiscountPercent: discount,
      calculatedPrice: discounted,
      customerExtraAmount: extra,
      totalPrice: total,
      reserveAmount: reserve,
      requiredCapacity: required,
    };
  }

  async createOrder(companyId: string, dto: CreateDeliveryCompanyOrderDto) {
    const company = await this.prisma.deliveryCompany.findUnique({
      where: { id: companyId },
      include: { proxyCustomer: true },
    });
    if (!company) throw new NotFoundException('Delivery company not found');
    if (!company.proxyCustomerId || !company.proxyCustomer) {
      throw new BadRequestException('Delivery company is not linked to a proxy customer');
    }

    const preview = await this.previewOrder(companyId, dto);
    const availableCapacity =
      Number(company.coinBalance) + Number(company.maxNegativeBalance) - Number(company.lockedCoins);
    if (availableCapacity < preview.requiredCapacity) {
      throw new BadRequestException('Insufficient company balance capacity');
    }

    const pickupAddr = await this.prisma.address.findUnique({ where: { id: dto.pickupAddressId } });
    if (!pickupAddr) throw new NotFoundException('Pickup address not found');
    const localPickup = !!dto.localPickupOnly;
    if (!localPickup && !dto.dropoffAddressId) {
      throw new BadRequestException('Drop-off address is required');
    }
    if (!localPickup) {
      const dropAddr = await this.prisma.address.findUnique({ where: { id: dto.dropoffAddressId! } });
      if (!dropAddr) throw new NotFoundException('Drop-off address not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedCompany = await tx.deliveryCompany.update({
        where: { id: companyId },
        data: {
          coinBalance: Number(company.coinBalance) - preview.totalPrice,
          lockedCoins: Number(company.lockedCoins) + preview.reserveAmount,
        },
      });
      await tx.deliveryCompanyTransaction.create({
        data: {
          deliveryCompanyId: companyId,
          type: DeliveryCompanyTransactionType.ORDER_PAYMENT,
          amount: -preview.totalPrice,
          balanceAfter: Number(updatedCompany.coinBalance),
          description: 'Order payment at placement',
        },
      });

      const order = await tx.order.create({
        data: {
          customerId: company.proxyCustomerId!,
          deliveryCompanyId: company.id,
          sourceType: OrderSourceType.DELIVERY_COMPANY,
          pricingPolicyId: (await tx.countryPricingPolicy.findFirst({ where: { isActive: true } }))!.id,
          pickupAddressId: dto.pickupAddressId,
          dropoffAddressId: localPickup ? null : dto.dropoffAddressId,
          localPickupOnly: localPickup,
          status: OrderStatus.SEARCHING_DRIVER,
          paymentType: PaymentType.WALLET,
          description: dto.description,
          weight: dto.weight,
          distanceKm: 2,
          price: preview.totalPrice,
          customerExtraAmount: preview.customerExtraAmount,
          nightFee: 0,
          extraWeightFee: 0,
          isNightDelivery: false,
          cancelTimerRemainingSeconds: 15 * 60,
          cancelTimerLastResumedAt: new Date(),
          cancelTimerPausedAt: null,
        },
      });
      await this.logAudit(companyId, 'ORDER_CREATED', 'COMPANY', null, { orderId: order.id, total: preview.totalPrice });
      return order;
    });
  }

  async createRefundRequest(companyId: string, dto: CreateDeliveryCompanyRefundRequestDto) {
    const company = await this.prisma.deliveryCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Delivery company not found');
    const available = Number(company.coinBalance) - Number(company.lockedCoins);
    if (available < dto.amountCoins) {
      throw new BadRequestException('Insufficient available coins for refund');
    }
    return this.prisma.$transaction(async (tx) => {
      const nextBalance = Number(company.coinBalance) - dto.amountCoins;
      await tx.deliveryCompany.update({
        where: { id: companyId },
        data: { coinBalance: nextBalance },
      });
      await tx.deliveryCompanyTransaction.create({
        data: {
          deliveryCompanyId: companyId,
          type: DeliveryCompanyTransactionType.REFUND_REQUEST,
          amount: -dto.amountCoins,
          balanceAfter: nextBalance,
          description: 'Refund requested by company',
        },
      });
      const req = await tx.deliveryCompanyRefundRequest.create({
        data: {
          deliveryCompanyId: companyId,
          amountCoins: dto.amountCoins,
          amountMoney: dto.amountCoins,
          destinationType: dto.destinationType,
          status: DeliveryCompanyRefundStatus.PENDING,
          reason: dto.reason,
        },
      });
      await this.logAudit(companyId, 'REFUND_REQUEST_CREATED', 'COMPANY', null, { refundRequestId: req.id, amount: dto.amountCoins });
      return req;
    });
  }

  async listRefundRequests(companyId: string) {
    return this.prisma.deliveryCompanyRefundRequest.findMany({
      where: { deliveryCompanyId: companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(companyId: string, from?: string, to?: string) {
    const where: any = { deliveryCompanyId: companyId, sourceType: OrderSourceType.DELIVERY_COMPANY };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const [count, delivered, returned, cancelled, gross] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.DELIVERED } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.RETURNED } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.CANCELLED } }),
      this.prisma.order.aggregate({ where, _sum: { price: true } }),
    ]);
    return {
      orders: count,
      delivered,
      returned,
      cancelled,
      grossAmount: Number(gross._sum.price ?? 0),
    };
  }

  private async getEffectiveDiscountPercent(company: { defaultDiscountPercent: any }) {
    if (company.defaultDiscountPercent !== null && company.defaultDiscountPercent !== undefined) {
      return Number(company.defaultDiscountPercent);
    }
    const cfg = await this.prisma.systemConfig.findUnique({
      where: { key: 'Discount_for_delivery_companies' },
    });
    return cfg ? Number(cfg.value) : -10;
  }

  private normalizeExtra(raw?: number): number {
    const v = Number(raw ?? 0);
    if (!Number.isFinite(v) || v < 0) {
      throw new BadRequestException('Invalid extra amount');
    }
    if (v > DeliveryCompanyService.MAX_CUSTOMER_EXTRA) {
      throw new BadRequestException(`Extra amount cannot exceed ${DeliveryCompanyService.MAX_CUSTOMER_EXTRA}`);
    }
    return Math.round(v * 100) / 100;
  }

  private async logAudit(
    deliveryCompanyId: string,
    actionType: string,
    actorType: string,
    actorRef?: string | null,
    details?: Record<string, unknown>,
  ) {
    await (this.prisma as any).deliveryCompanyAuditLog.create({
      data: {
        deliveryCompanyId,
        actionType,
        actorType,
        actorRef: actorRef ?? null,
        details: details ?? undefined,
      },
    });
  }
}
