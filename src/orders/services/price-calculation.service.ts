import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryZoneType } from '@prisma/client';

export interface PriceCalculationResult {
  baseFee: number;
  distanceFee: number;
  extraWeightFee: number;
  nightFee: number;
  totalPrice: number;
  pricingPolicyId: string;
  deliveryZoneType: DeliveryZoneType;
}

@Injectable()
export class PriceCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in kilometers
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Determine delivery zone type based on addresses
   */
  async determineDeliveryZoneType(
    pickupAddressId: string,
    dropoffAddressId: string,
  ): Promise<DeliveryZoneType> {
    const [pickupAddress, dropoffAddress] = await Promise.all([
      this.prisma.address.findUnique({
        where: { id: pickupAddressId },
        include: {
          delegation: {
            include: {
              governorate: {
                include: {
                  country: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.address.findUnique({
        where: { id: dropoffAddressId },
        include: {
          delegation: {
            include: {
              governorate: {
                include: {
                  country: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!pickupAddress || !dropoffAddress) {
      throw new Error('Address not found');
    }

    const pickupCountryId = pickupAddress.delegation.governorate.country.id;
    const dropoffCountryId = dropoffAddress.delegation.governorate.country.id;
    const pickupGovernorateId = pickupAddress.delegation.governorate.id;
    const dropoffGovernorateId = dropoffAddress.delegation.governorate.id;
    const pickupDelegationId = pickupAddress.delegation.id;
    const dropoffDelegationId = dropoffAddress.delegation.id;

    // Determine zone type
    if (pickupDelegationId === dropoffDelegationId) {
      return DeliveryZoneType.SAME_DELEGATION;
    } else if (pickupGovernorateId === dropoffGovernorateId) {
      return DeliveryZoneType.SAME_GOVERNORATE;
    } else if (pickupCountryId === dropoffCountryId) {
      return DeliveryZoneType.DIFFERENT_GOVERNORATE;
    } else {
      return DeliveryZoneType.DIFFERENT_COUNTRY;
    }
  }

  /**
   * Calculate order price based on distance, weight, and delivery zone
   */
  async calculatePrice(
    pickupAddressId: string,
    dropoffAddressId: string,
    weight: number,
    isNightDelivery: boolean = false,
  ): Promise<PriceCalculationResult> {
    // Get addresses with coordinates
    const [pickupAddress, dropoffAddress] = await Promise.all([
      this.prisma.address.findUnique({
        where: { id: pickupAddressId },
        include: {
          delegation: {
            include: {
              governorate: {
                include: {
                  country: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.address.findUnique({
        where: { id: dropoffAddressId },
        include: {
          delegation: {
            include: {
              governorate: {
                include: {
                  country: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!pickupAddress || !dropoffAddress) {
      throw new Error('Address not found');
    }

    if (
      !pickupAddress.latitude ||
      !pickupAddress.longitude ||
      !dropoffAddress.latitude ||
      !dropoffAddress.longitude
    ) {
      throw new Error('Address coordinates are required');
    }

    // Calculate distance
    const distanceKm = this.calculateDistance(
      pickupAddress.latitude,
      pickupAddress.longitude,
      dropoffAddress.latitude,
      dropoffAddress.longitude,
    );

    // Determine delivery zone type
    const deliveryZoneType = await this.determineDeliveryZoneType(
      pickupAddressId,
      dropoffAddressId,
    );

    // Get pricing policy for the country and zone type
    const countryId = pickupAddress.delegation.governorate.country.id;
    const pricingPolicy = await this.prisma.countryPricingPolicy.findFirst({
      where: {
        countryId,
        deliveryZoneType,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!pricingPolicy) {
      throw new Error(
        `No active pricing policy found for country and zone type: ${deliveryZoneType}`,
      );
    }

    // Round distance up: <1km → 1km, <2km → 2km, etc.
    const billingDistanceKm = Math.max(1, Math.ceil(distanceKm));

    // Calculate fees
    const baseFee = Number(pricingPolicy.baseFee);
    const distanceFee = Number(pricingPolicy.pricePerKm) * billingDistanceKm;

    // Calculate extra weight fee
    let extraWeightFee = 0;
    const baseWeight = Number(pricingPolicy.baseWeight);
    if (weight > baseWeight) {
      const extraWeight = weight - baseWeight;
      const extraWeightSteps = Math.ceil(
        extraWeight / Number(pricingPolicy.extraWeightStep),
      );
      extraWeightFee =
        extraWeightSteps * Number(pricingPolicy.extraWeightPrice);
    }

    // Calculate night fee
    const nightFee = isNightDelivery ? Number(pricingPolicy.nightFee) : 0;

    // Calculate total price
    const totalPrice = baseFee + distanceFee + extraWeightFee + nightFee;

    return {
      baseFee,
      distanceFee,
      extraWeightFee,
      nightFee,
      totalPrice: Math.round(totalPrice * 100) / 100,
      pricingPolicyId: pricingPolicy.id,
      deliveryZoneType,
    };
  }
}
