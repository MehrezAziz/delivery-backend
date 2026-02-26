import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePricingPolicyDto, UpdatePricingPolicyDto } from '../dto/pricing.dto';

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

    return this.prisma.countryPricingPolicy.create({
      data: {
        ...dto,
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

    return this.prisma.countryPricingPolicy.update({
      where: { id },
      data: dto,
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
