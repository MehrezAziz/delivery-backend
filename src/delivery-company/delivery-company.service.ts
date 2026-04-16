import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
      calculatedPrice: discounted,
      discountedPrice: discounted,
      customerExtraAmount: extra,
      weightKg: dto.weight,
      distanceKm: priceCalc.distanceKm,
      billingDistanceKm: priceCalc.billingDistanceKm,
      pricePerKm: priceCalc.pricePerKm,
      nightFee: priceCalc.nightFee,
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
          pricingPolicyId: (await tx.countryPricingPolicy.findFirst({ where: { isActive: true } }))!.id,
          pickupAddressId: resolvedPickupAddressId,
          dropoffAddressId: localPickup ? null : resolvedDropoffAddressId,
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
    const directAddress = await this.prisma.address.findUnique({
      where: { id: pickupAddressId },
      select: { id: true },
    });
    if (directAddress) return directAddress.id;

    const where: any = { id: pickupAddressId, deliveryCompanyId: companyId };
    if (departmentId) where.id = departmentId;
    const department = await (this.prisma as any).deliveryCompanyAddress.findFirst({
      where,
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

    const center = await this.resolveDelegationCenter(dropDelegation.id, dto.dropoffGovernorateId);
    const distanceKm = this.priceCalculationService.calculateDistance(
      pickupAddress.latitude,
      pickupAddress.longitude,
      center.latitude,
      center.longitude,
    );
    const deliveryZoneType =
      pickupAddress.delegation.id === dropDelegation.id
        ? 'SAME_DELEGATION'
        : pickupAddress.delegation.governorate.id === dropDelegation.governorate.id
          ? 'SAME_GOVERNORATE'
          : 'DIFFERENT_GOVERNORATE';
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
    const billingDistanceKm = Math.max(1, Math.ceil(distanceKm));
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
    if (!delegation.addresses.length) {
      throw new BadRequestException('Delegation center is unavailable. Please add a mapped address in this delegation.');
    }
    const latitude =
      delegation.addresses.reduce((sum, addr) => sum + Number(addr.latitude), 0) / delegation.addresses.length;
    const longitude =
      delegation.addresses.reduce((sum, addr) => sum + Number(addr.longitude), 0) / delegation.addresses.length;
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
