import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

  async getCountries() {
    return this.prisma.country.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isoCode: true, currencyCode: true, currencySymbol: true },
      orderBy: { name: 'asc' },
    });
  }

  async getGovernorates(countryId: string) {
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) throw new NotFoundException('Country not found');

    return this.prisma.governorate.findMany({
      where: { countryId },
      select: { id: true, nameGovernorate: true },
      orderBy: { nameGovernorate: 'asc' },
    });
  }

  async getDelegations(governorateId: string) {
    const gov = await this.prisma.governorate.findUnique({ where: { id: governorateId } });
    if (!gov) throw new NotFoundException('Governorate not found');

    return this.prisma.delegation.findMany({
      where: { governorateId },
      select: { id: true, nameDelegation: true, maxConfirmationDelayMinutes: true },
      orderBy: { nameDelegation: 'asc' },
    });
  }

  /**
   * Find the nearest delegation to given coordinates.
   * Computes distance from the average lat/lng of addresses in each delegation.
   */
  async getDelegationByCoordinates(lat: number, lng: number) {
    if (isNaN(lat) || isNaN(lng)) {
      throw new BadRequestException('Valid lat and lng query parameters are required');
    }

    // Get all delegations with their addresses that have coordinates
    const delegations = await this.prisma.delegation.findMany({
      include: {
        addresses: {
          where: { latitude: { not: null }, longitude: { not: null } },
          select: { latitude: true, longitude: true },
        },
        governorate: {
          include: {
            country: {
              select: { id: true, name: true, isoCode: true, currencyCode: true, currencySymbol: true },
            },
          },
        },
      },
    });

    // If no delegations have addresses with coordinates, just return the first delegation
    // in the country closest to the coordinates (fallback)
    let bestDelegation: any = null;
    let bestDistance = Infinity;

    for (const del of delegations) {
      if (del.addresses.length === 0) continue;
      // Calculate average position of addresses in this delegation
      const avgLat = del.addresses.reduce((s, a) => s + a.latitude!, 0) / del.addresses.length;
      const avgLng = del.addresses.reduce((s, a) => s + a.longitude!, 0) / del.addresses.length;
      const dist = this.haversineDistance(lat, lng, avgLat, avgLng);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestDelegation = del;
      }
    }

    if (!bestDelegation) {
      // Fallback: return first delegation available
      const fallback = await this.prisma.delegation.findFirst({
        include: {
          governorate: {
            include: { country: { select: { id: true, name: true, isoCode: true, currencyCode: true, currencySymbol: true } } },
          },
        },
      });
      if (!fallback) throw new NotFoundException('No delegations found');
      return {
        id: fallback.id,
        nameDelegation: fallback.nameDelegation,
        governorate: {
          id: fallback.governorate.id,
          nameGovernorate: fallback.governorate.nameGovernorate,
          country: fallback.governorate.country,
        },
      };
    }

    return {
      id: bestDelegation.id,
      nameDelegation: bestDelegation.nameDelegation,
      governorate: {
        id: bestDelegation.governorate.id,
        nameGovernorate: bestDelegation.governorate.nameGovernorate,
        country: bestDelegation.governorate.country,
      },
    };
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
