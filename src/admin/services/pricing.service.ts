import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePricingPolicyDto, UpdatePricingPolicyDto } from '../dto/pricing.dto';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function assertBaseFeeSplit(baseFee: number, platformFee: number, referralCommission: number): void {
  const sum = round2(platformFee + referralCommission);
  if (Math.abs(round2(baseFee) - sum) > 0.001) {
    throw new BadRequestException('base_fee must equal platform_fee + referral_commission (within 0.01)');
  }
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new pricing policy
   */
  async createPricingPolicy(dto: CreatePricingPolicyDto) {
    // Verify country exists
    const country = await this.prisma.country.findUnique({
      where: { id: dto.countryId },
    });

    if (!country) {
      throw new NotFoundException('Country not found');
    }

    // Check if active policy already exists for this country and zone type
    const existingActive = await this.prisma.countryPricingPolicy.findFirst({
      where: {
        countryId: dto.countryId,
        deliveryZoneType: dto.deliveryZoneType,
        isActive: true,
      },
    });

    if (existingActive) {
      throw new ConflictException(
        `An active pricing policy already exists for ${dto.deliveryZoneType} in this country. Please deactivate it first or set this policy as inactive.`,
      );
    }

    const referralCommission =
      dto.referralCommission !== undefined && dto.referralCommission !== null
        ? dto.referralCommission
        : round2(dto.baseFee - dto.platformFee);
    assertBaseFeeSplit(dto.baseFee, dto.platformFee, referralCommission);

    return this.prisma.countryPricingPolicy.create({
      data: {
        countryId: dto.countryId,
        deliveryZoneType: dto.deliveryZoneType,
        pricePerKm: dto.pricePerKm,
        baseFee: dto.baseFee,
        baseWeight: dto.baseWeight,
        extraWeightStep: dto.extraWeightStep,
        extraWeightPrice: dto.extraWeightPrice,
        nightFee: dto.nightFee,
        platformFee: dto.platformFee,
        referralCommission,
        maxNegativeDays: dto.maxNegativeDays,
        isActive: dto.isActive ?? true,
      },
      include: {
        country: true,
      },
    });
  }

  /**
   * Get all pricing policies
   */
  async getAllPricingPolicies(countryId?: string, isActive?: boolean) {
    return this.prisma.countryPricingPolicy.findMany({
      where: {
        ...(countryId && { countryId }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        country: true,
      },
      orderBy: [
        { countryId: 'asc' },
        { deliveryZoneType: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Get pricing policy by ID
   */
  async getPricingPolicyById(id: string) {
    const policy = await this.prisma.countryPricingPolicy.findUnique({
      where: { id },
      include: {
        country: true,
      },
    });

    if (!policy) {
      throw new NotFoundException('Pricing policy not found');
    }

    return policy;
  }

  /**
   * Get pricing policies by country and zone type
   */
  async getPricingPoliciesByCountryAndZone(countryId: string, deliveryZoneType?: string) {
    return this.prisma.countryPricingPolicy.findMany({
      where: {
        countryId,
        ...(deliveryZoneType && { deliveryZoneType: deliveryZoneType as any }),
      },
      include: {
        country: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Update pricing policy
   */
  async updatePricingPolicy(id: string, dto: UpdatePricingPolicyDto) {
    const policy = await this.prisma.countryPricingPolicy.findUnique({
      where: { id },
    });

    if (!policy) {
      throw new NotFoundException('Pricing policy not found');
    }

    // If activating this policy, check for conflicts
    if (dto.isActive === true && !policy.isActive) {
      const existingActive = await this.prisma.countryPricingPolicy.findFirst({
        where: {
          countryId: policy.countryId,
          deliveryZoneType: policy.deliveryZoneType,
          isActive: true,
          id: { not: id },
        },
      });

      if (existingActive) {
        throw new ConflictException(
          `Another active pricing policy already exists for this zone type. Please deactivate it first.`,
        );
      }
    }

    const nextBase = dto.baseFee ?? Number(policy.baseFee);
    const nextPlatform = dto.platformFee ?? Number(policy.platformFee);
    const nextReferral =
      dto.referralCommission !== undefined && dto.referralCommission !== null
        ? dto.referralCommission
        : round2(nextBase - nextPlatform);
    assertBaseFeeSplit(nextBase, nextPlatform, nextReferral);

    return this.prisma.countryPricingPolicy.update({
      where: { id },
      data: {
        ...(dto.pricePerKm !== undefined && { pricePerKm: dto.pricePerKm }),
        ...(dto.baseFee !== undefined && { baseFee: dto.baseFee }),
        ...(dto.baseWeight !== undefined && { baseWeight: dto.baseWeight }),
        ...(dto.extraWeightStep !== undefined && { extraWeightStep: dto.extraWeightStep }),
        ...(dto.extraWeightPrice !== undefined && { extraWeightPrice: dto.extraWeightPrice }),
        ...(dto.nightFee !== undefined && { nightFee: dto.nightFee }),
        ...(dto.platformFee !== undefined && { platformFee: dto.platformFee }),
        referralCommission: nextReferral,
        ...(dto.maxNegativeDays !== undefined && { maxNegativeDays: dto.maxNegativeDays }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        country: true,
      },
    });
  }

  /**
   * Delete pricing policy
   */
  async deletePricingPolicy(id: string) {
    const policy = await this.prisma.countryPricingPolicy.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!policy) {
      throw new NotFoundException('Pricing policy not found');
    }

    if (policy._count.orders > 0) {
      throw new BadRequestException(
        'Cannot delete pricing policy that has been used in orders. Consider deactivating it instead.',
      );
    }

    await this.prisma.countryPricingPolicy.delete({ where: { id } });
  }

  /**
   * Deactivate pricing policy
   */
  async deactivatePricingPolicy(id: string) {
    const policy = await this.prisma.countryPricingPolicy.findUnique({
      where: { id },
    });

    if (!policy) {
      throw new NotFoundException('Pricing policy not found');
    }

    return this.prisma.countryPricingPolicy.update({
      where: { id },
      data: { isActive: false },
      include: {
        country: true,
      },
    });
  }

  /**
   * Get active pricing policy for country and zone type
   */
  async getActivePricingPolicy(countryId: string, deliveryZoneType: string) {
    const policy = await this.prisma.countryPricingPolicy.findFirst({
      where: {
        countryId,
        deliveryZoneType: deliveryZoneType as any,
        isActive: true,
      },
      include: {
        country: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!policy) {
      throw new NotFoundException(
        `No active pricing policy found for ${deliveryZoneType} in this country`,
      );
    }

    return policy;
  }
}
