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
   * Find the delegation for given coordinates.
   * Uses Google reverse geocoding to get locality names, then matches against delegation names.
   * Falls back to nearest-address approach if Google geocoding fails.
   */
    async getDelegationByCoordinates(lat: number, lng: number) {
      if (isNaN(lat) || isNaN(lng)) {
        throw new BadRequestException('Valid lat and lng query parameters are required');
      }

      // Step 1: Try Google reverse geocoding to get locality names
      const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (googleApiKey) {
        try {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}&language=en&result_type=locality|administrative_area_level_2|administrative_area_level_1`;
          const res = await fetch(url);
          const json = await res.json();

          if (json.results && json.results.length > 0) {
            // Extract all relevant locality names from address components
            const candidateNames: string[] = [];
            for (const result of json.results) {
              for (const comp of result.address_components || []) {
                if (
                  comp.types.includes('locality') ||
                  comp.types.includes('administrative_area_level_2') ||
                  comp.types.includes('sublocality') ||
                  comp.types.includes('administrative_area_level_1')
                ) {
                  candidateNames.push(comp.long_name.toLowerCase());
                  if (comp.short_name && comp.short_name !== comp.long_name) {
                    candidateNames.push(comp.short_name.toLowerCase());
                  }
                }
              }
            }

            if (candidateNames.length > 0) {
              // Load all delegations with governorate info
              const allDelegations = await this.prisma.delegation.findMany({
                include: {
                  governorate: {
                    include: {
                      country: {
                        select: { id: true, name: true, isoCode: true, currencyCode: true, currencySymbol: true },
                      },
                    },
                  },
                },
              });

              // Try exact match first, then partial match
              for (const del of allDelegations) {
                const delName = del.nameDelegation.toLowerCase();
                if (candidateNames.some(c => c === delName || delName === c)) {
                  return this.formatDelegation(del);
                }
              }
              // Partial match: delegation name contains or is contained in a candidate
              for (const del of allDelegations) {
                const delName = del.nameDelegation.toLowerCase();
                if (candidateNames.some(c => c.includes(delName) || delName.includes(c))) {
                  return this.formatDelegation(del);
                }
              }
            }
          }
        } catch (e) {
          // Google geocoding failed, fall through to distance-based fallback
          console.warn('Google reverse geocoding failed, using distance fallback:', e);
        }
      }

      // Step 2: Fallback — find nearest delegation by average address coordinates
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

      let bestDelegation: any = null;
      let bestDistance = Infinity;

      for (const del of delegations) {
        if (del.addresses.length === 0) continue;
        const avgLat = del.addresses.reduce((s, a) => s + a.latitude!, 0) / del.addresses.length;
        const avgLng = del.addresses.reduce((s, a) => s + a.longitude!, 0) / del.addresses.length;
        const dist = this.haversineDistance(lat, lng, avgLat, avgLng);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestDelegation = del;
        }
      }

      if (!bestDelegation) {
        const fallback = await this.prisma.delegation.findFirst({
          include: {
            governorate: {
              include: { country: { select: { id: true, name: true, isoCode: true, currencyCode: true, currencySymbol: true } } },
            },
          },
        });
        if (!fallback) throw new NotFoundException('No delegations found');
        return this.formatDelegation(fallback);
      }

      return this.formatDelegation(bestDelegation);
    }

  private formatDelegation(del: any) {
    return {
      id: del.id,
      nameDelegation: del.nameDelegation,
      governorate: {
        id: del.governorate.id,
        nameGovernorate: del.governorate.nameGovernorate,
        country: del.governorate.country,
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
