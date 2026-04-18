import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DeliveryCompanyRefundDestinationType, DeliveryCompanyRefundStatus, DeliveryCompanyTransactionType, OrderSourceType, OrderStatus, PaymentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PriceCalculationService } from '../orders/services/price-calculation.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly notificationsService: NotificationsService,
  ) {}

  async ensureDepartmentBelongsToCompany(companyId: string, departmentId?: string | null) {
    if (!departmentId) return;
    const dept = await this.prisma.deliveryCompanyAddress.findFirst({
      where: { id: departmentId, deliveryCompanyId: companyId },
      select: { id: true },
    });
    if (!dept) {
      throw new ForbiddenException('Department context is invalid for this delivery company');
    }
  }

  /** JSON-safe serialization for storing idempotency response bodies. */
  private safeJson(value: any): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map((v) => this.safeJson(v));
    if (typeof value === 'object') {
      const ctorName = value?.constructor?.name;
      // Prisma Decimal (avoid storing complex objects inside Json columns)
      if (ctorName === 'Decimal') return value.toString();
      const out: any = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.safeJson(v);
      return out;
    }
    return String(value);
  }

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

  async listCompanyOrders(companyId: string, departmentId?: string) {
    return this.prisma.order.findMany({
      where: {
        deliveryCompanyId: companyId,
        sourceType: OrderSourceType.DELIVERY_COMPANY,
        ...(departmentId ? { deliveryCompanyDepartmentId: departmentId } : {}),
      },
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
    departmentId?: string,
    idempotencyKey?: string,
    requestHash?: string,
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
        ...(departmentId ? { deliveryCompanyDepartmentId: departmentId } : {}),
      },
      include: { returnDepositFeedback: true },
    });
    if (!order) throw new NotFoundException('Order not found for this company');
    if (order.status !== OrderStatus.RETURN_DEPOSIT) {
      throw new BadRequestException('Feedback is allowed only after return deposit.');
    }

    const dbAny: any = this.prisma as any;
    const hasIdempotencyModel = !!dbAny?.deliveryCompanyIdempotencyKey;

    const endpointKey = `delivery-company/orders/${orderId}/return-deposit-feedback:POST`;

    return this.prisma.$transaction(async (tx) => {
      const txAny: any = tx as any;

      let responseBody: any;

      if (hasIdempotencyModel && idempotencyKey && requestHash) {
        const existing = await txAny.deliveryCompanyIdempotencyKey.findFirst({
          where: { deliveryCompanyId: companyId, endpointKey, idempotencyKey },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new BadRequestException('Idempotency key used with a different request body');
          }
          if (existing.responseBody) return existing.responseBody;
          throw new BadRequestException('Idempotency request is in progress; please retry');
        }

        let idemRow: any;
        try {
          idemRow = await txAny.deliveryCompanyIdempotencyKey.create({
            data: {
              deliveryCompanyId: companyId,
              actorRef: departmentId ?? null,
              endpointKey,
              idempotencyKey,
              requestHash,
              responseStatus: 0,
              responseBody: null,
            },
          });
        } catch (e: any) {
          // Concurrency safety: unique constraint won by another inflight request
          if (e?.code === 'P2002') {
            const again = await txAny.deliveryCompanyIdempotencyKey.findFirst({
              where: { deliveryCompanyId: companyId, endpointKey, idempotencyKey },
              orderBy: { createdAt: 'desc' },
            });
            if (again?.responseBody) return again.responseBody;
            throw new BadRequestException('Idempotency request is in progress; please retry');
          }
          throw e;
        }

        const existingFeedback = await txAny.orderReturnDepositFeedback.findUnique({
          where: { orderId },
        });

        const saved = existingFeedback
          ? await txAny.orderReturnDepositFeedback.update({
              where: { orderId },
              data: {
                feedback: text,
                conditionIssue,
                reportedByUserId: order.customerId,
              },
            })
          : await txAny.orderReturnDepositFeedback.create({
              data: {
                orderId,
                feedback: text,
                conditionIssue,
                reportedByUserId: order.customerId,
              },
            });

        responseBody = { message: 'Return deposit feedback saved', feedback: saved };
        await txAny.deliveryCompanyIdempotencyKey.update({
          where: { id: idemRow.id },
          data: { responseStatus: 200, responseBody: this.safeJson(responseBody) },
        });
        return responseBody;
      }

      // Non-idempotent path (for backwards compatibility)
      const existingFeedback = await txAny.orderReturnDepositFeedback.findUnique({ where: { orderId } });
      const saved = existingFeedback
        ? await txAny.orderReturnDepositFeedback.update({
            where: { orderId },
            data: {
              feedback: text,
              conditionIssue,
              reportedByUserId: order.customerId,
            },
          })
        : await txAny.orderReturnDepositFeedback.create({
            data: {
              orderId,
              feedback: text,
              conditionIssue,
              reportedByUserId: order.customerId,
            },
          });
      responseBody = { message: 'Return deposit feedback saved', feedback: saved };
      return responseBody;
    });
  }

  async getWallet(companyId: string, departmentId?: string) {
    if (departmentId) {
      const deptWallet = await (this.prisma as any).deliveryCompanyDepartmentBudgetWallet.findUnique({
        where: { departmentId },
      });
      return {
        balance: Number(deptWallet?.availableCoins ?? 0),
        locked: Number(deptWallet?.lockedCoins ?? 0),
        maxNegativeBalance: 0,
        availableCapacity: Number(deptWallet?.availableCoins ?? 0) - Number(deptWallet?.lockedCoins ?? 0),
      };
    }
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

  async getWalletTransactions(companyId: string, departmentId?: string) {
    if (departmentId) {
      const rows = await (this.prisma as any).deliveryCompanyDepartmentBudgetRequest.findMany({
        where: { deliveryCompanyId: companyId, departmentId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return rows.map((r: any) => ({
        id: r.id,
        type: `BUDGET_REQUEST_${r.status}`,
        amount: r.amountCoins,
        description: r.decisionNote ?? null,
        createdAt: r.createdAt,
      }));
    }
    return this.prisma.deliveryCompanyTransaction.findMany({
      where: { deliveryCompanyId: companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async previewOrder(companyId: string, dto: CreateDeliveryCompanyOrderDto, departmentId?: string): Promise<CompanyOrderPreviewResponseDto> {
    const company = await this.prisma.deliveryCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Delivery company not found');

    const localPickup = !!dto.localPickupOnly;
    if (departmentId) {
      const dept = await (this.prisma as any).deliveryCompanyAddress.findFirst({
        where: { id: departmentId, deliveryCompanyId: companyId },
        select: { id: true },
      });
      if (!dept) throw new BadRequestException('Department context is invalid');
    }
    const extra = this.normalizeExtra(dto.customerExtraAmount);
    const confirmationDelayMinutes = Math.max(1, Math.min(180, Number(dto.maxConfirmationDelayMinutes ?? 15)));
    const isNight = false;
    const resolvedPickupAddressId = await this.resolvePickupAddressIdForCompanyOrder(
      companyId,
      dto.pickupAddressId,
      departmentId,
    );

    const priceCalc = localPickup
      ? await this.priceCalculationService.calculateLocalPickupOnlyPrice(resolvedPickupAddressId, dto.weight, isNight)
      : await this.calculateCompanyDropoffPrice(resolvedPickupAddressId, dto, isNight);

    const discount = await this.getEffectiveDiscountPercent(company);
    const discounted = Math.round(priceCalc.totalPrice * (1 + discount / 100) * 100) / 100;
    const total = Math.round((discounted + extra) * 100) / 100;
    const reserve = Math.round(total * 0.5 * 100) / 100;
    const required = total + reserve;
    return {
      paymentType: PaymentType.WALLET,
      effectiveDiscountPercent: discount,
      baseFee: priceCalc.baseFee,
      distanceFee: priceCalc.distanceFee,
      calculatedPrice: discounted,
      discountedPrice: discounted,
      customerExtraAmount: extra,
      weightKg: dto.weight,
      distanceKm: priceCalc.distanceKm,
      billingDistanceKm: priceCalc.billingDistanceKm,
      pricePerKm: priceCalc.pricePerKm,
      nightFee: priceCalc.nightFee,
      extraWeightFee: priceCalc.extraWeightFee,
      pricingPolicyId: priceCalc.pricingPolicyId,
      maxConfirmationDelayMinutes: confirmationDelayMinutes,
      totalPrice: total,
      reserveAmount: reserve,
      requiredCapacity: required,
    };
  }

  async createOrder(
    companyId: string,
    dto: CreateDeliveryCompanyOrderDto,
    departmentId?: string,
    idempotencyKey?: string,
    requestHash?: string,
  ) {
    let company = await this.prisma.deliveryCompany.findUnique({
      where: { id: companyId },
      include: { proxyCustomer: true },
    });
    if (!company) throw new NotFoundException('Delivery company not found');
    if (!company.proxyCustomerId || !company.proxyCustomer) {
      const proxy = await this.ensureProxyCustomer(company);
      company = await this.prisma.deliveryCompany.update({
        where: { id: companyId },
        data: { proxyCustomerId: proxy.id },
        include: { proxyCustomer: true },
      });
    }

    const preview = await this.previewOrder(companyId, dto, departmentId);
    const confirmationDelayMinutes = Math.max(1, Math.min(180, Number(dto.maxConfirmationDelayMinutes ?? 15)));

    const endpointKey = 'delivery-company/orders:POST';
    const idemKey = idempotencyKey && requestHash ? idempotencyKey : undefined;
    const dbAny: any = this.prisma as any;
    const hasIdempotencyModel = !!dbAny?.deliveryCompanyIdempotencyKey;
    const availableCapacity =
      Number(company.coinBalance) + Number(company.maxNegativeBalance) - Number(company.lockedCoins);
    if (availableCapacity < preview.requiredCapacity) {
      throw new BadRequestException('Insufficient company balance capacity');
    }

    const resolvedPickupAddressId = await this.resolvePickupAddressIdForCompanyOrder(
      companyId,
      dto.pickupAddressId,
      departmentId,
    );
    const pickupAddr = await this.prisma.address.findUnique({ where: { id: resolvedPickupAddressId } });
    if (!pickupAddr) throw new NotFoundException('Pickup address not found');
    const localPickup = !!dto.localPickupOnly;
    let resolvedDropoffAddressId: string | undefined;
    if (!localPickup) {
      resolvedDropoffAddressId = await this.resolveDropoffAddressIdForCompanyOrder(dto);
    }

    return this.prisma.$transaction(async (tx) => {
      const txAny: any = tx as any;

      // Idempotency persistence check (critical write)
      let idemRow: any | null = null;
      if (hasIdempotencyModel && idemKey && requestHash) {
        const existing = await txAny.deliveryCompanyIdempotencyKey.findFirst({
          where: {
            deliveryCompanyId: companyId,
            endpointKey,
            idempotencyKey: idemKey,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new BadRequestException('Idempotency key used with a different request body');
          }
          if (existing.responseBody) return existing.responseBody;
          // Same key + same body, but first call hasn't produced a response yet.
          throw new BadRequestException('Idempotency request is in progress; please retry');
        }

        try {
          idemRow = await txAny.deliveryCompanyIdempotencyKey.create({
            data: {
              deliveryCompanyId: companyId,
              actorRef: departmentId ?? null,
              endpointKey,
              idempotencyKey: idemKey,
              requestHash,
              responseStatus: 0,
              responseBody: null,
            },
          });
        } catch (e: any) {
          if (e?.code === 'P2002') {
            const again = await txAny.deliveryCompanyIdempotencyKey.findFirst({
              where: { deliveryCompanyId: companyId, endpointKey, idempotencyKey: idemKey },
              orderBy: { createdAt: 'desc' },
            });
            if (again?.responseBody) return again.responseBody;
            throw new BadRequestException('Idempotency request is in progress; please retry');
          }
          throw e;
        }
      }

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
          deliveryCompanyDepartmentId: departmentId ?? null,
          pricingPolicyId: preview.pricingPolicyId,
          pickupAddressId: resolvedPickupAddressId,
          dropoffAddressId: localPickup ? null : resolvedDropoffAddressId,
          localPickupOnly: localPickup,
          status: OrderStatus.SEARCHING_DRIVER,
          paymentType: PaymentType.WALLET,
          description: dto.description,
          weight: dto.weight,
          distanceKm: preview.distanceKm,
          price: preview.totalPrice,
          customerExtraAmount: preview.customerExtraAmount,
          nightFee: preview.nightFee,
          extraWeightFee: preview.extraWeightFee,
          isNightDelivery: false,
          cancelAfterMinutes: confirmationDelayMinutes,
          cancelTimerRemainingSeconds: confirmationDelayMinutes * 60,
          cancelTimerLastResumedAt: new Date(),
          cancelTimerPausedAt: null,
        },
      });
      await this.logAudit(companyId, 'ORDER_CREATED', 'COMPANY', null, { orderId: order.id, total: preview.totalPrice });
      if (hasIdempotencyModel && idemKey && requestHash && idemRow?.id) {
        const serialized = this.safeJson(order);
        await txAny.deliveryCompanyIdempotencyKey.update({
          where: { id: idemRow.id },
          data: {
            responseStatus: 201,
            responseBody: serialized,
          },
        });
      }
      return order;
    });
  }

  private async resolvePickupAddressIdForCompanyOrder(
    companyId: string,
    pickupAddressId: string,
    departmentId?: string,
  ): Promise<string> {
    // Company orders always pick up from the department facility: never resolve a random Address row first.
    const whereDept: any = departmentId
      ? { id: departmentId, deliveryCompanyId: companyId }
      : { id: pickupAddressId, deliveryCompanyId: companyId };

    const department = await (this.prisma as any).deliveryCompanyAddress.findFirst({
      where: whereDept,
      select: {
        id: true,
        country: true,
        city: true,
        street: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!department) {
      throw new NotFoundException('Pickup address not found');
    }
    if (department.latitude == null || department.longitude == null) {
      throw new BadRequestException('Department coordinates are required for pickup');
    }

    const country = await this.prisma.country.findFirst({
      where: { name: { equals: String(department.country || ''), mode: 'insensitive' } },
      select: { id: true },
    });
    if (!country) throw new BadRequestException('Department country mapping is invalid');

    const governorate = await this.prisma.governorate.findFirst({
      where: {
        countryId: country.id,
        nameGovernorate: { equals: String(department.city || ''), mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (!governorate) throw new BadRequestException('Department governorate mapping is invalid');

    const delegation = await this.prisma.delegation.findFirst({
      where: {
        governorateId: governorate.id,
        nameDelegation: { equals: String(department.street || ''), mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (!delegation) throw new BadRequestException('Department delegation mapping is invalid');

    const existing = await this.prisma.address.findFirst({
      where: {
        userId: null,
        delegationId: delegation.id,
        street: department.street || null,
        latitude: department.latitude,
        longitude: department.longitude,
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.address.create({
      data: {
        delegationId: delegation.id,
        street: department.street || null,
        latitude: department.latitude,
        longitude: department.longitude,
        userId: null,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async resolveDropoffAddressIdForCompanyOrder(dto: CreateDeliveryCompanyOrderDto): Promise<string> {
    if (dto.dropoffAddressId) {
      const dropAddr = await this.prisma.address.findUnique({ where: { id: dto.dropoffAddressId } });
      if (!dropAddr) throw new NotFoundException('Drop-off address not found');
      return dropAddr.id;
    }
    if (!dto.dropoffDelegationId || !dto.dropoffGovernorateId) {
      throw new BadRequestException('Drop-off governorate and delegation are required');
    }
    const center = await this.resolveDelegationCenter(dto.dropoffDelegationId, dto.dropoffGovernorateId);
    const created = await this.prisma.address.create({
      data: {
        delegationId: dto.dropoffDelegationId,
        street: dto.dropoffStreet?.trim() || null,
        latitude: center.latitude,
        longitude: center.longitude,
        userId: null,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async calculateCompanyDropoffPrice(
    pickupAddressId: string,
    dto: CreateDeliveryCompanyOrderDto,
    isNight: boolean,
  ) {
    if (dto.dropoffAddressId) {
      return this.priceCalculationService.calculatePrice(pickupAddressId, dto.dropoffAddressId, dto.weight, isNight);
    }
    if (!dto.dropoffDelegationId || !dto.dropoffGovernorateId) {
      throw new BadRequestException('Drop-off governorate and delegation are required');
    }
    const pickupAddress = await this.prisma.address.findUnique({
      where: { id: pickupAddressId },
      include: {
        delegation: { include: { governorate: { include: { country: true } } } },
      },
    });
    if (!pickupAddress) throw new NotFoundException('Pickup address not found');
    if (pickupAddress.latitude == null || pickupAddress.longitude == null) {
      throw new BadRequestException('Pickup coordinates are required');
    }

    const dropDelegation = await this.prisma.delegation.findFirst({
      where: { id: dto.dropoffDelegationId, governorateId: dto.dropoffGovernorateId },
      include: { governorate: { include: { country: true } } },
    });
    if (!dropDelegation) {
      throw new BadRequestException('Drop-off delegation is invalid for selected governorate');
    }
    if (dropDelegation.governorate.countryId !== pickupAddress.delegation.governorate.countryId) {
      throw new BadRequestException('Drop-off country must match the pickup department country');
    }

    const deliveryZoneType =
      pickupAddress.delegation.id === dropDelegation.id
        ? 'SAME_DELEGATION'
        : pickupAddress.delegation.governorate.id === dropDelegation.governorate.id
          ? 'SAME_GOVERNORATE'
          : 'DIFFERENT_GOVERNORATE';
    let distanceKm = 0;
    if (deliveryZoneType === 'SAME_DELEGATION') {
      // Business override: keep same-delegation company deliveries at a fixed 4km distance.
      distanceKm = 4;
    } else if (deliveryZoneType === 'SAME_GOVERNORATE') {
      const govCenter = await this.resolveGovernorateCenter(dto.dropoffGovernorateId);
      distanceKm = this.priceCalculationService.calculateDistance(
        pickupAddress.latitude,
        pickupAddress.longitude,
        govCenter.latitude,
        govCenter.longitude,
      );
    } else {
      const center = await this.resolveDelegationCenter(dropDelegation.id, dto.dropoffGovernorateId);
      distanceKm = this.priceCalculationService.calculateDistance(
        pickupAddress.latitude,
        pickupAddress.longitude,
        center.latitude,
        center.longitude,
      );
    }
    const pricingPolicy = await this.prisma.countryPricingPolicy.findFirst({
      where: {
        countryId: pickupAddress.delegation.governorate.country.id,
        deliveryZoneType: deliveryZoneType as any,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!pricingPolicy) {
      throw new BadRequestException(`No active pricing policy found for zone type: ${deliveryZoneType}`);
    }
    const billingDistanceKm = deliveryZoneType === 'SAME_DELEGATION' ? 4 : Math.max(1, Math.ceil(distanceKm));
    const pricePerKm = Number(pricingPolicy.pricePerKm);
    const baseFee = Number(pricingPolicy.baseFee);
    const distanceFee = pricePerKm * billingDistanceKm;
    let extraWeightFee = 0;
    const baseWeight = Number(pricingPolicy.baseWeight);
    if (dto.weight > baseWeight) {
      const extraWeight = dto.weight - baseWeight;
      const extraWeightSteps = Math.ceil(extraWeight / Number(pricingPolicy.extraWeightStep));
      extraWeightFee = extraWeightSteps * Number(pricingPolicy.extraWeightPrice);
    }
    const nightFee = isNight ? Number(pricingPolicy.nightFee) : 0;
    const totalPrice = baseFee + distanceFee + extraWeightFee + nightFee;
    return {
      baseFee,
      distanceFee,
      extraWeightFee,
      nightFee,
      distanceKm,
      billingDistanceKm,
      pricePerKm,
      totalPrice: Math.round(totalPrice * 100) / 100,
      pricingPolicyId: pricingPolicy.id,
      deliveryZoneType: deliveryZoneType as any,
    };
  }

  private async ensureProxyCustomer(company: any) {
    const seed = createHash('sha256').update(company.id).digest('hex').slice(0, 8);
    const user = await this.prisma.user.create({
      data: {
        role: 'CUSTOMER' as any,
        firstName: company.name || 'Delivery',
        secondName: 'Company',
        myEmail: company.contactEmail || null,
        phone: `dc-${seed}`,
      } as any,
    });
    const customer = await this.prisma.customer.create({
      data: {
        userId: user.id,
      },
    });
    await this.logAudit(company.id, 'PROXY_CUSTOMER_AUTO_CREATED', 'SYSTEM', null, {
      userId: user.id,
      customerId: customer.id,
    });
    return customer;
  }

  private async resolveDelegationCenter(delegationId: string, governorateId: string): Promise<{ latitude: number; longitude: number }> {
    const delegation = await this.prisma.delegation.findFirst({
      where: { id: delegationId, governorateId },
      select: {
        id: true,
        addresses: {
          where: { latitude: { not: null }, longitude: { not: null } },
          select: { latitude: true, longitude: true },
        },
      },
    });
    if (!delegation) throw new BadRequestException('Delegation not found');
    if (delegation.addresses.length) {
      const latitude =
        delegation.addresses.reduce((sum, addr) => sum + Number(addr.latitude), 0) / delegation.addresses.length;
      const longitude =
        delegation.addresses.reduce((sum, addr) => sum + Number(addr.longitude), 0) / delegation.addresses.length;
      return { latitude, longitude };
    }
    // Fallback: centroid of any mapped addresses in this governorate (many DBs only seed coords per governorate).
    const govAddrs = await this.prisma.address.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        delegation: { governorateId },
      },
      select: { latitude: true, longitude: true },
      take: 500,
    });
    if (!govAddrs.length) {
      throw new BadRequestException(
        'No coordinates are available for this destination yet. Pick another delegation or ask an admin to add at least one address with latitude/longitude in this governorate.',
      );
    }
    const latitude = govAddrs.reduce((sum, a) => sum + Number(a.latitude), 0) / govAddrs.length;
    const longitude = govAddrs.reduce((sum, a) => sum + Number(a.longitude), 0) / govAddrs.length;
    return { latitude, longitude };
  }

  private async resolveGovernorateCenter(governorateId: string): Promise<{ latitude: number; longitude: number }> {
    const govAddrs = await this.prisma.address.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        delegation: { governorateId },
      },
      select: { latitude: true, longitude: true },
      take: 1000,
    });
    if (!govAddrs.length) {
      throw new BadRequestException(
        'No coordinates are available for this governorate yet. Please add at least one mapped address first.',
      );
    }
    const latitude = govAddrs.reduce((sum, a) => sum + Number(a.latitude), 0) / govAddrs.length;
    const longitude = govAddrs.reduce((sum, a) => sum + Number(a.longitude), 0) / govAddrs.length;
    return { latitude, longitude };
  }

  async createRefundRequest(
    companyId: string,
    dto: CreateDeliveryCompanyRefundRequestDto,
    idempotencyKey?: string,
    requestHash?: string,
  ) {
    const company = await this.prisma.deliveryCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Delivery company not found');
    const available = Number(company.coinBalance) - Number(company.lockedCoins);
    if (available < dto.amountCoins) {
      throw new BadRequestException('Insufficient available coins for refund');
    }

    const endpointKey = 'delivery-company/refund-requests:POST';
    const idemKey = idempotencyKey && requestHash ? idempotencyKey : undefined;
    const dbAny: any = this.prisma as any;
    const hasIdempotencyModel = !!dbAny?.deliveryCompanyIdempotencyKey;

    return this.prisma.$transaction(async (tx) => {
      const txAny: any = tx as any;

      let idemRow: any | null = null;

      // Idempotency persistence check (critical write)
      if (hasIdempotencyModel && idemKey && requestHash) {
        const existing = await txAny.deliveryCompanyIdempotencyKey.findFirst({
          where: {
            deliveryCompanyId: companyId,
            endpointKey,
            idempotencyKey: idemKey,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new BadRequestException('Idempotency key used with a different request body');
          }
          if (existing.responseBody) return existing.responseBody;
          throw new BadRequestException('Idempotency request is in progress; please retry');
        }

        try {
          idemRow = await txAny.deliveryCompanyIdempotencyKey.create({
            data: {
              deliveryCompanyId: companyId,
              actorRef: null,
              endpointKey,
              idempotencyKey: idemKey,
              requestHash,
              responseStatus: 0,
              responseBody: null,
            },
          });
        } catch (e: any) {
          if (e?.code === 'P2002') {
            const again = await txAny.deliveryCompanyIdempotencyKey.findFirst({
              where: { deliveryCompanyId: companyId, endpointKey, idempotencyKey: idemKey },
              orderBy: { createdAt: 'desc' },
            });
            if (again?.responseBody) return again.responseBody;
            throw new BadRequestException('Idempotency request is in progress; please retry');
          }
          throw e;
        }
      }

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
      if (hasIdempotencyModel && idemKey && requestHash) {
        const serialized = this.safeJson(req);
        await txAny.deliveryCompanyIdempotencyKey.update({
          where: { id: idemRow?.id },
          data: {
            responseStatus: 201,
            responseBody: serialized,
          },
        });
      }
      return req;
    });
  }

  async listRefundRequests(companyId: string) {
    return this.prisma.deliveryCompanyRefundRequest.findMany({
      where: { deliveryCompanyId: companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(companyId: string, from?: string, to?: string, departmentId?: string) {
    const where: any = {
      deliveryCompanyId: companyId,
      sourceType: OrderSourceType.DELIVERY_COMPANY,
      ...(departmentId ? { deliveryCompanyDepartmentId: departmentId } : {}),
    };
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

  async addOrderConfirmationDelayMinutes(
    companyId: string,
    orderId: string,
    minutesToAdd: number,
    departmentId?: string,
  ) {
    const add = Math.floor(Number(minutesToAdd));
    if (!Number.isFinite(add) || add < 1 || add > 180) {
      throw new BadRequestException('Minutes to add must be between 1 and 180');
    }

    const where: any = {
      id: orderId,
      deliveryCompanyId: companyId,
      sourceType: OrderSourceType.DELIVERY_COMPANY,
      ...(departmentId ? { deliveryCompanyDepartmentId: departmentId } : {}),
    };

    const order = await this.prisma.order.findFirst({ where });
    if (!order) throw new NotFoundException('Order not found for this company');
    const status = String(order.status);
    if (!['SEARCHING_DRIVER', 'PENDING_CUSTOMER_APPROVAL', 'DRIVER_ASSIGNED'].includes(status)) {
      throw new BadRequestException('Confirmation timer can only be extended before pickup');
    }

    const now = Date.now();
    const baseRemaining =
      typeof (order as any).cancelTimerRemainingSeconds === 'number'
        ? Number((order as any).cancelTimerRemainingSeconds)
        : Number((order as any).cancelAfterMinutes ?? 15) * 60;
    const lastResumedAt = (order as any).cancelTimerLastResumedAt
      ? new Date((order as any).cancelTimerLastResumedAt).getTime()
      : null;
    const elapsed =
      status === 'SEARCHING_DRIVER' && lastResumedAt ? Math.floor((now - lastResumedAt) / 1000) : 0;
    const currentRemaining = Math.max(0, baseRemaining - elapsed);
    const nextRemaining = currentRemaining + add * 60;
    const nextCancelAfterMinutes = Math.max(1, Math.ceil(nextRemaining / 60));

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        cancelAfterMinutes: nextCancelAfterMinutes,
        cancelTimerRemainingSeconds: nextRemaining,
        cancelTimerLastResumedAt: status === 'SEARCHING_DRIVER' ? new Date() : null,
        cancelTimerPausedAt:
          status === 'SEARCHING_DRIVER'
            ? null
            : ((order as any).cancelTimerPausedAt ? (order as any).cancelTimerPausedAt : new Date()),
      },
      select: {
        id: true,
        cancelAfterMinutes: true,
        cancelTimerRemainingSeconds: true,
      },
    });

    await this.logAudit(companyId, 'ORDER_CONFIRMATION_DELAY_EXTENDED', 'COMPANY', null, {
      orderId: updated.id,
      minutesAdded: add,
      cancelAfterMinutes: updated.cancelAfterMinutes,
      cancelTimerRemainingSeconds: updated.cancelTimerRemainingSeconds,
      departmentId: departmentId ?? null,
    });

    return {
      message: 'Confirmation delay updated',
      orderId: updated.id,
      minutesAdded: add,
      cancelAfterMinutes: updated.cancelAfterMinutes,
      cancelTimerRemainingSeconds: updated.cancelTimerRemainingSeconds,
    };
  }

  async approveOrderDriver(companyId: string, orderId: string, departmentId?: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        deliveryCompanyId: companyId,
        sourceType: OrderSourceType.DELIVERY_COMPANY,
        ...(departmentId ? { deliveryCompanyDepartmentId: departmentId } : {}),
      },
      include: {
        customer: { include: { user: { select: { id: true, firstName: true, secondName: true } } } },
        driverAssignment: { include: { driver: { include: { user: { select: { id: true } } } } } },
      },
    });
    if (!order) throw new NotFoundException('Order not found for this company');
    if (String(order.status) !== 'PENDING_CUSTOMER_APPROVAL') {
      throw new BadRequestException('Order is not pending driver approval');
    }
    if (!order.driverAssignment) {
      throw new BadRequestException('No driver assigned');
    }

    const remaining = (() => {
      const fallback = Math.max(0, Number((order as any).cancelAfterMinutes ?? 15) * 60);
      const base =
        typeof (order as any).cancelTimerRemainingSeconds === 'number'
          ? Number((order as any).cancelTimerRemainingSeconds)
          : fallback;
      if (String(order.status) !== 'SEARCHING_DRIVER') return Math.max(0, base);
      const last = (order as any).cancelTimerLastResumedAt
        ? new Date((order as any).cancelTimerLastResumedAt).getTime()
        : null;
      if (!last) return Math.max(0, base);
      return Math.max(0, base - Math.floor((Date.now() - last) / 1000));
    })();

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.DRIVER_ASSIGNED,
        cancelTimerRemainingSeconds: remaining,
        cancelTimerPausedAt: new Date(),
        cancelTimerLastResumedAt: null,
      },
      include: {
        driverAssignment: { include: { driver: { include: { user: true } } } },
      },
    });

    const driverUserId = (updated as any)?.driverAssignment?.driver?.user?.id;
    if (driverUserId) {
      await this.notificationsService.send({
        userId: driverUserId,
        userType: 'USER',
        type: 'DRIVER_ASSIGNED' as any,
        relatedEntityType: 'Order',
        relatedEntityId: updated.id,
        groupKey: `order:${updated.id}`,
        updateExisting: true,
        ongoing: true,
        orderStatus: 'DRIVER_ASSIGNED',
        trackingAudience: 'DRIVER',
      } as any);
    }

    await this.logAudit(companyId, 'ORDER_DRIVER_APPROVED', 'COMPANY', null, {
      orderId: updated.id,
      driverId: updated.driverAssignment?.driverId ?? null,
      departmentId: departmentId ?? null,
    });
    return updated;
  }

  /**
   * Mirrors `OrdersService.computeCancelRemainingSeconds`: while the order is not in SEARCHING_DRIVER,
   * the stored `cancelTimerRemainingSeconds` stays the budget from the last company approval (frozen).
   * In SEARCHING_DRIVER, time elapses from `cancelTimerLastResumedAt`.
   */
  private computeRemainingSecondsForResumeToSearching(order: {
    status: OrderStatus | string;
    cancelTimerRemainingSeconds?: number | null;
    cancelAfterMinutes?: number | null;
    cancelTimerLastResumedAt?: Date | null;
  }): number {
    const fallback = Math.max(0, Number(order.cancelAfterMinutes ?? 15) * 60);
    const baseRemaining =
      typeof order.cancelTimerRemainingSeconds === 'number'
        ? Number(order.cancelTimerRemainingSeconds)
        : fallback;
    if (String(order.status) !== 'SEARCHING_DRIVER') {
      return Math.max(0, baseRemaining);
    }
    const lastResumedAt = order.cancelTimerLastResumedAt
      ? new Date(order.cancelTimerLastResumedAt).getTime()
      : null;
    if (!lastResumedAt) return Math.max(0, baseRemaining);
    const elapsedSec = Math.floor((Date.now() - lastResumedAt) / 1000);
    return Math.max(0, baseRemaining - elapsedSec);
  }

  async rejectOrderDriver(companyId: string, orderId: string, reason?: string, departmentId?: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        deliveryCompanyId: companyId,
        sourceType: OrderSourceType.DELIVERY_COMPANY,
        ...(departmentId ? { deliveryCompanyDepartmentId: departmentId } : {}),
      },
      include: { driverAssignment: { include: { driver: { select: { userId: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found for this company');
    const status = String(order.status);
    const allowed = ['PENDING_CUSTOMER_APPROVAL', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Driver cannot be rejected at this stage');
    }
    if (!order.driverAssignment) {
      throw new BadRequestException('No driver assigned');
    }
    if (status === 'DRIVER_ARRIVED' && String(reason || '').trim().length < 10) {
      throw new BadRequestException('Please provide a rejection reason (minimum 10 characters)');
    }

    /** Same semantics as `OrdersService.computeCancelRemainingSeconds` + resume to SEARCHING: countdown is based on the
     *  frozen budget from when the company last approved a driver (not driver `acceptedAt`). */
    const nextRemaining = this.computeRemainingSecondsForResumeToSearching(order as any);
    const nextStatus = nextRemaining <= 0 ? OrderStatus.CANCELLED : OrderStatus.SEARCHING_DRIVER;

    const driverUserId = order.driverAssignment?.driver?.userId ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.orderDriverRejection.create({
        data: {
          orderId: order.id,
          driverId: order.driverAssignment!.driverId,
          reason: String(reason || '').trim() || null,
        },
      });
      if (status === 'DRIVER_ARRIVED') {
        await tx.orderDriverArrivalConflict.create({
          data: {
            orderId: order.id,
            customerId: order.customerId,
            driverId: order.driverAssignment!.driverId,
            customerReason: String(reason || '').trim(),
          },
        });
      }
      await tx.driverAssignment.delete({ where: { orderId: order.id } });
      await tx.order.update({
        where: { id: order.id },
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
                cancelTimerRemainingSeconds: nextRemaining,
                cancelTimerPausedAt: null,
                cancelTimerLastResumedAt: new Date(),
              },
      });
      if (nextStatus === OrderStatus.CANCELLED) {
        const company = await tx.deliveryCompany.findUnique({ where: { id: order.deliveryCompanyId! } });
        if (company) {
          const price = Math.round(Number(order.price || 0) * 100) / 100;
          const reserve = Math.round(price * 0.5 * 100) / 100;
          const unlock = Math.min(Number(company.lockedCoins), reserve);
          const restoreAmount = Math.round((price + unlock) * 100) / 100;
          const nextBalance = Math.round((Number(company.coinBalance) + restoreAmount) * 100) / 100;
          const nextLocked = Math.max(0, Number(company.lockedCoins) - unlock);
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
              description: `Budget rollback for CANCELLED order ${order.id}`,
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
      await tx.chatRoom.updateMany({
        where: { orderId: order.id, status: 'ACTIVE' as any },
        data: { status: 'CLOSED' as any },
      });
    });

    if (driverUserId) {
      const reasonText = String(reason || '').trim();
      await this.notificationsService.send({
        userId: driverUserId,
        userType: 'USER',
        type: 'ORDER_CANCELLED_BY_CUSTOMER' as any,
        title: 'Removed from company order',
        body: reasonText
          ? `You were rejected from this order. Reason: ${reasonText}`
          : 'You were rejected from this company delivery order.',
        relatedEntityType: 'Order',
        relatedEntityId: order.id,
        groupKey: `order:${order.id}`,
        updateExisting: true,
        ongoing: false,
        orderStatus: 'FAILED',
        trackingAudience: 'DRIVER',
        suppressDriverTapNavigation: status !== 'DRIVER_ARRIVED',
      } as any);
    }

    await this.logAudit(companyId, 'ORDER_DRIVER_REJECTED', 'COMPANY', null, {
      orderId: order.id,
      reason: String(reason || '').trim() || null,
      departmentId: departmentId ?? null,
    });
    return { message: 'Driver rejected. Searching for a new driver.' };
  }

  async getOrderChat(companyId: string, orderId: string, departmentId?: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        deliveryCompanyId: companyId,
        sourceType: OrderSourceType.DELIVERY_COMPANY,
        ...(departmentId ? { deliveryCompanyDepartmentId: departmentId } : {}),
      },
      include: {
        chatRooms: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            driver: { include: { user: { select: { firstName: true, secondName: true } } } },
            messages: {
              orderBy: { timestamp: 'asc' },
              include: { sender: { select: { firstName: true, secondName: true } } },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found for this company');
    const room = (order as any).chatRooms?.[0] || null;
    if (!room) return null;
    return {
      id: room.id,
      status: room.status,
      driver: room.driver
        ? {
            id: room.driver.id,
            name: `${room.driver.user?.firstName || ''} ${room.driver.user?.secondName || ''}`.trim() || 'Driver',
          }
        : null,
      messages: (room.messages || []).map((m: any) => ({
        id: m.id,
        senderType: m.senderType,
        senderName: `${m.sender?.firstName || ''} ${m.sender?.secondName || ''}`.trim() || 'User',
        content: m.content,
        image: m.image,
        timestamp: m.timestamp,
      })),
    };
  }

  async sendOrderChatMessage(companyId: string, orderId: string, content: string, departmentId?: string) {
    const text = String(content || '').trim();
    if (text.length < 1) throw new BadRequestException('Message content is required');
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        deliveryCompanyId: companyId,
        sourceType: OrderSourceType.DELIVERY_COMPANY,
        ...(departmentId ? { deliveryCompanyDepartmentId: departmentId } : {}),
      },
      include: {
        customer: { include: { user: true } },
        chatRooms: {
          where: { status: 'ACTIVE' as any },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { driver: { include: { user: { select: { id: true } } } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found for this company');
    const room = (order as any).chatRooms?.[0];
    if (!room) throw new BadRequestException('No active chat room for this order');
    const senderUserId = (order as any)?.customer?.user?.id;
    if (!senderUserId) throw new BadRequestException('Company proxy customer is missing');

    const message = await this.prisma.message.create({
      data: {
        chatRoomId: room.id,
        senderId: senderUserId,
        senderType: 'CUSTOMER' as any,
        content: text,
      },
      include: {
        sender: { select: { firstName: true, secondName: true } },
      },
    });
    await this.logAudit(companyId, 'ORDER_CHAT_MESSAGE_SENT', 'COMPANY', null, {
      orderId,
      chatRoomId: room.id,
      departmentId: departmentId ?? null,
    });
    const driverUserId = room?.driver?.user?.id;
    if (driverUserId) {
      await this.notificationsService.send({
        userId: driverUserId,
        userType: 'USER',
        type: 'NEW_MESSAGE_FROM_CUSTOMER' as any,
        relatedEntityType: 'Order',
        relatedEntityId: orderId,
        groupKey: `chat:${orderId}`,
        templateData: { customerName: 'Company' },
      } as any);
    }
    return {
      id: message.id,
      senderType: message.senderType,
      senderName: `${message.sender?.firstName || ''} ${message.sender?.secondName || ''}`.trim() || 'Company',
      content: message.content,
      image: message.image,
      timestamp: message.timestamp,
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
